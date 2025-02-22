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
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

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
        if (!token || !token.iceServers) {
            throw new Error('Invalid response from Twilio');
        }
        
        // Ensure we have both STUN and TURN servers
        const iceServers = token.iceServers.map(server => ({
            ...server,
            urls: Array.isArray(server.urls) ? server.urls : [server.urls]
        }));

        // Add fallback STUN servers
        iceServers.push({
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302'
            ]
        });

        console.log('Sending ICE servers:', JSON.stringify(iceServers, null, 2));
        res.json(iceServers);
    } catch (error) {
        console.error('Error fetching ICE servers:', error);
        res.status(500).json({
            error: 'Failed to fetch ICE servers',
            fallback: [
                {
                    urls: [
                        'stun:stun1.l.google.com:19302',
                        'stun:stun2.l.google.com:19302'
                    ]
                }
            ]
        });
    }
});

// Track users and rooms
const users = new Map();
const activeRooms = new Map();
const waitingQueue = {
    practice: new Map(), // language -> [users]
    coach: new Map()     // language -> [users]
};

// Constants
const ROOM_TIMEOUT = 1000 * 60 * 60; // 1 hour
const QUEUE_TIMEOUT = 1000 * 60 * 5; // 5 minutes
const MAX_QUEUE_SIZE = 50;

// Cleanup inactive rooms periodically
setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of activeRooms.entries()) {
        if (now - room.lastActivity > ROOM_TIMEOUT) {
            console.log(`Cleaning up inactive room: ${roomId}`);
            // Notify users in the room
            room.users.forEach(userId => {
                const socket = io.sockets.sockets.get(userId);
                if (socket) {
                    socket.emit('room-timeout');
                }
            });
            activeRooms.delete(roomId);
        }
    }
}, 1000 * 60 * 15); // Check every 15 minutes

// Clean up queues periodically
setInterval(() => {
    const now = Date.now();
    for (const role of ['practice', 'coach']) {
        for (const [language, queue] of waitingQueue[role].entries()) {
            // Remove disconnected and timed out users
            const activeQueue = queue.filter(socket => {
                const isConnected = io.sockets.sockets.has(socket.id);
                const isTimedOut = now - socket.userData.joinedAt > QUEUE_TIMEOUT;
                
                if (!isConnected || isTimedOut) {
                    console.log(`Removing ${isConnected ? 'timed out' : 'disconnected'} socket ${socket.id} from ${role} queue for ${language}`);
                    if (isTimedOut && isConnected) {
                        socket.emit('queue-timeout');
                    }
                    return false;
                }
                return true;
            });
            
            if (activeQueue.length === 0) {
                waitingQueue[role].delete(language);
                console.log(`Removed empty queue for ${language} ${role}`);
            } else {
                waitingQueue[role].set(language, activeQueue);
            }
        }
    }
}, 1000 * 60); // Check every minute

// Function to create a room
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

        // Notify both users about the match with their roles
        socket1.emit('match-found', { 
            room: roomId,
            role: socket1.userData.role,
            peerRole: socket2.userData.role
        });
        socket2.emit('match-found', { 
            room: roomId,
            role: socket2.userData.role,
            peerRole: socket1.userData.role
        });
        
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
        // Validate input
        if (!language || !role || !['practice', 'coach'].includes(role)) {
            socket.emit('error', { message: 'Invalid language or role' });
            return;
        }

        // Add state tracking with timestamp for queue priority
        socket.userData = {
            language,
            role,
            state: 'waiting',
            joinedAt: Date.now()
        };
        
        const oppositeRole = role === 'practice' ? 'coach' : 'practice';
        const oppositeQueue = waitingQueue[oppositeRole];

        console.log(`User ${socket.id} joining as ${role} for ${language}`);
        console.log('Opposite queue status:', oppositeQueue.has(language) ? oppositeQueue.get(language).length : 0);

        // Check queue size limit
        if (waitingQueue[role].has(language) && waitingQueue[role].get(language).length >= MAX_QUEUE_SIZE) {
            socket.emit('error', { message: 'Queue is full, please try again later' });
            return;
        }

        // Check for matching partner in opposite role queue for the same language
        if (oppositeQueue.has(language) && oppositeQueue.get(language).length > 0) {
            // Sort queue by join time to implement FIFO matching
            const sortedQueue = oppositeQueue.get(language).sort((a, b) =>
                a.userData.joinedAt - b.userData.joinedAt
            );
            
            // Find first available match
            const matchedSocket = sortedQueue[0];
            
            // Remove matched user from queue
            oppositeQueue.set(language, sortedQueue.slice(1));
            
            // Create room for matched pair
            createRoom(socket, matchedSocket, language);
            
            console.log(`Matched ${socket.id} (${role}) with ${matchedSocket.id} (${oppositeRole}) for ${language}`);
        } else {
            // Add to appropriate waiting queue
            if (!waitingQueue[role].has(language)) {
                waitingQueue[role].set(language, []);
            }
            waitingQueue[role].get(language).push(socket);
            socket.emit('waiting', {
                position: waitingQueue[role].get(language).length,
                estimatedWait: Math.min(waitingQueue[role].get(language).length * 30, 300) // 30 seconds per person, max 5 minutes
            });
            console.log(`Added ${socket.id} to ${role} queue for ${language}`);
            
            // Log queue status
            const queueLength = waitingQueue[role].get(language).length;
            console.log(`${role} queue for ${language} now has ${queueLength} users waiting`);
        }
    });

    socket.on('offer', ({ offer, room }) => {
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
        
        // Update room status
        roomInfo.status = 'negotiating';
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

    // Handle connection quality updates
    socket.on('connection-quality', ({ room, quality }) => {
        if (activeRooms.has(room) && activeRooms.get(room).users.includes(socket.id)) {
            socket.to(room).emit('peer-connection-quality', { quality });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Clean up waiting queues
        for (const role of ['practice', 'coach']) {
            for (const [language, queue] of waitingQueue[role].entries()) {
                const index = queue.findIndex(s => s.id === socket.id);
                if (index !== -1) {
                    queue.splice(index, 1);
                    console.log(`Removed ${socket.id} from ${role} queue for ${language}`);
                    if (queue.length === 0) {
                        waitingQueue[role].delete(language);
                    }
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
                        otherSocket.emit('peer-disconnected', {
                            reason: 'Peer disconnected',
                            roomId: room
                        });
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
    // Give time for error to be logged before exiting
    setTimeout(() => process.exit(1), 1000);
});