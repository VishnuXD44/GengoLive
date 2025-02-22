const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const twilio = require('twilio');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Initialize Twilio client
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Endpoint to get Twilio ICE servers
app.get('/api/get-ice-servers', async (req, res) => {
    try {
        const token = await twilioClient.tokens.create();
        res.json(token.iceServers);
    } catch (error) {
        console.error('Error fetching ICE servers:', error);
        res.status(500).json({ error: 'Failed to fetch ICE servers' });
    }
});
// Track users and rooms
const users = new Map();
const activeRooms = new Map();
const waitingQueue = {
    practice: new Map(), // language -> [users]
    coach: new Map()     // language -> [users]
};

// Cleanup inactive rooms periodically
const ROOM_TIMEOUT = 1000 * 60 * 60; // 1 hour
setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of activeRooms.entries()) {
        if (now - room.lastActivity > ROOM_TIMEOUT) {
            console.log(`Cleaning up inactive room: ${roomId}`);
            activeRooms.delete(roomId);
        }
    }
}, 1000 * 60 * 15); // Check every 15 minutes

// Clean up empty queues periodically
setInterval(() => {
    for (const role of ['practice', 'coach']) {
        for (const [language, queue] of waitingQueue[role].entries()) {
            // Remove disconnected sockets from queue
            const activeQueue = queue.filter(socket => {
                const isConnected = io.sockets.sockets.has(socket.id);
                if (!isConnected) {
                    console.log(`Removing disconnected socket ${socket.id} from ${role} queue for ${language}`);
                }
                return isConnected;
            });
            
            if (activeQueue.length === 0) {
                waitingQueue[role].delete(language);
                console.log(`Removed empty queue for ${language} ${role}`);
            } else {
                waitingQueue[role].set(language, activeQueue);
            }
        }
    }
}, 1000 * 60 * 5); // Check every 5 minutes

// Handle signaling through Socket.IO
// Function to create a room (moved outside connection handler)
function createRoom(socket1, socket2, language) {
    try {
        const roomId = `${language}_${Date.now()}`;
        
        // Join both sockets to the room
        socket1.join(roomId);
        socket2.join(roomId);
        
        // Create room info
        const roomInfo = {
            language,
            users: [socket1.id, socket2.id],
            createdAt: Date.now(),
            lastActivity: Date.now(),
            status: 'created',
            roles: {
                [socket1.id]: socket1.userData.role,
                [socket2.id]: socket2.userData.role
            }
        };
        
        activeRooms.set(roomId, roomInfo);

        // Notify both users about the match
        socket1.emit('match-found', { room: roomId });
        socket2.emit('match-found', { room: roomId });
        
        console.log(`Created room ${roomId} for language ${language}`);
        return roomId;
    } catch (error) {
        console.error('Failed to create room:', error);
        socket1.emit('error', { message: 'Failed to create room' });
        socket2.emit('error', { message: 'Failed to create room' });
        throw error;
    }
}

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', ({ language, role }) => {
        // Add state tracking
        socket.userData = { language, role, state: 'waiting' };
        
        const oppositeRole = role === 'practice' ? 'coach' : 'practice';
        const oppositeQueue = waitingQueue[oppositeRole];

        console.log(`User ${socket.id} joining as ${role} for ${language}`);
        console.log('Opposite queue status:', oppositeQueue.has(language) ? oppositeQueue.get(language).length : 0);

        if (oppositeQueue.has(language) && oppositeQueue.get(language).length > 0) {
            const matchedSocket = oppositeQueue.get(language).shift();
            createRoom(socket, matchedSocket, language);
        } else {
            if (!waitingQueue[role].has(language)) {
                waitingQueue[role].set(language, []);
            }
            waitingQueue[role].get(language).push(socket);
            socket.emit('waiting');
            console.log(`Added ${socket.id} to ${role} queue for ${language}`);
        }
    });

    socket.on('offer', ({ offer, room, candidates }) => {
        if (!activeRooms.has(room)) {
            console.warn(`Offer received for non-existent room: ${room}`);
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const roomInfo = activeRooms.get(room);
        if (!roomInfo.users.includes(socket.id)) {
            console.warn(`Unauthorized offer from socket ${socket.id} for room ${room}`);
            socket.emit('error', { message: 'Not authorized for this room' });
            return;
        }

        console.log(`Forwarding offer in room: ${room}`);
        socket.to(room).emit('offer', { offer, room });
        
        // Forward any bundled candidates
        if (candidates && Array.isArray(candidates)) {
            candidates.forEach(candidate => {
                socket.to(room).emit('ice-candidate', { candidate, room });
            });
        }
        
        // Update room status - handle ICE restart case
        roomInfo.status = offer.type === 'offer' && !offer.iceRestart ? 'negotiating' : roomInfo.status;
        roomInfo.lastActivity = Date.now();
        activeRooms.set(room, roomInfo);
    });

    socket.on('answer', ({ answer, room }) => {
        if (!activeRooms.has(room)) {
            console.warn(`Answer received for non-existent room: ${room}`);
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        const roomInfo = activeRooms.get(room);
        if (!roomInfo.users.includes(socket.id)) {
            console.warn(`Unauthorized answer from socket ${socket.id} for room ${room}`);
            socket.emit('error', { message: 'Not authorized for this room' });
            return;
        }

        console.log(`Forwarding answer in room: ${room}`);
        socket.to(room).emit('answer', { answer, room });
        
        // Update room status
        roomInfo.status = 'connected';
        roomInfo.lastActivity = Date.now();
        activeRooms.set(room, roomInfo);
    });

    socket.on('ice-candidate', ({ candidate, room }) => {
        if (!activeRooms.has(room)) {
            console.warn(`ICE candidate received for non-existent room: ${room}`);
            return;
        }

        const roomInfo = activeRooms.get(room);
        if (!roomInfo.users.includes(socket.id)) {
            console.warn(`Unauthorized ICE candidate from socket ${socket.id} for room ${room}`);
            return;
        }

        console.log(`Forwarding ICE candidate in room: ${room}`);
        socket.to(room).emit('ice-candidate', { candidate, room });
        
        // Update room activity
        roomInfo.lastActivity = Date.now();
        activeRooms.set(room, roomInfo);
    });

    // Set up queue status logging
    const queueStatusInterval = setInterval(() => {
        console.log('\nCurrent Queue Status:');
        for (const role of ['practice', 'coach']) {
            for (const [language, queue] of waitingQueue[role].entries()) {
                console.log(`${role} - ${language}: ${queue.length} users waiting`);
            }
        }
        console.log('Active Rooms:', activeRooms.size);
    }, 10000); // Log every 10 seconds

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        clearInterval(queueStatusInterval);
        
        // Clean up waiting queues
        for (const role of ['practice', 'coach']) {
            for (const [language, queue] of waitingQueue[role].entries()) {
                const index = queue.findIndex(s => s.id === socket.id);
                if (index !== -1) {
                    queue.splice(index, 1);
                    console.log(`Removed ${socket.id} from ${role} queue for ${language}`);
                }
            }
        }

        // Clean up active rooms
        for (const [room, info] of activeRooms.entries()) {
            if (info.users.includes(socket.id)) {
                const otherUserId = info.users.find(id => id !== socket.id);
                if (otherUserId) {
                    const otherSocket = io.sockets.sockets.get(otherUserId);
                    if (otherSocket) {
                        otherSocket.emit('user-disconnected');
                    }
                }
                activeRooms.delete(room);
                console.log(`Cleaned up room: ${room}`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});