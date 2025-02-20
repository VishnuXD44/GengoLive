const users = new Map();
const activeRooms = new Map();
const waitingQueue = {
    practice: new Map(), // language -> [users]
    coach: new Map()     // language -> [users]
};

const ROOM_TIMEOUT = 1000 * 60 * 60; // 1 hour

function cleanupInactiveRooms() {
    const now = Date.now();
    for (const [roomId, room] of activeRooms.entries()) {
        if (now - room.createdAt > ROOM_TIMEOUT) {
            console.log(`Cleaning up inactive room: ${roomId}`);
            activeRooms.delete(roomId);
        }
    }
}

// Add to handleSignaling initialization
setInterval(cleanupInactiveRooms, 1000 * 60 * 15); // Check every 15 minutes

function handleSignaling(socket, io) {
    socket.on('join', ({ language, role }) => {
        // Add state tracking
        socket.userData = { language, role, state: 'waiting' };
        
        const oppositeRole = role === 'practice' ? 'coach' : 'practice';
        const oppositeQueue = waitingQueue[oppositeRole];

        if (oppositeQueue.has(language) && oppositeQueue.get(language).length > 0) {
            const matchedSocket = oppositeQueue.get(language).shift();
            createRoom(socket, matchedSocket, language);
        } else {
            if (!waitingQueue[role].has(language)) {
                waitingQueue[role].set(language, []);
            }
            waitingQueue[role].get(language).push(socket);
            socket.emit('waiting');
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

    socket.on('disconnect', () => {
        removeFromQueue(socket);
        
        // Clean up waiting users
        for (const [key, value] of users.entries()) {
            if (value.id === socket.id) {
                users.delete(key);
                console.log(`Removed waiting user: ${socket.id}`);
                break;
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
}

function removeFromQueue(socket) {
    const { role, language } = socket.userData || {};
    if (role && language && waitingQueue[role].has(language)) {
        const queue = waitingQueue[role].get(language);
        const index = queue.findIndex(s => s.id === socket.id);
        if (index !== -1) {
            queue.splice(index, 1);
            console.log(`Removed ${socket.id} from ${role} queue for ${language}`);
        }
    }
}

function createRoom(socket1, socket2, language) {
    try {
        const roomId = `${language}_${Date.now()}`;
        
        // Join both sockets to the room
        socket1.join(roomId);
        socket2.join(roomId);
        
        // Create room info with extended state tracking
        const roomInfo = {
            language,
            users: [socket1.id, socket2.id],
            createdAt: Date.now(),
            lastActivity: Date.now(),
            status: 'created',
            roles: {
                [socket1.id]: socket1.userData.role,
                [socket2.id]: socket2.userData.role
            },
            connectionAttempts: 0,
            negotiationTimeout: null,
            connectionTimeout: null
        };
        
        activeRooms.set(roomId, roomInfo);

        // Set up negotiation timeout (30 seconds)
        roomInfo.negotiationTimeout = setTimeout(() => {
            const room = activeRooms.get(roomId);
            if (room && room.status === 'created') {
                console.log(`Room ${roomId} timed out during negotiation`);
                cleanupRoom(roomId, socket1, socket2);
            }
        }, 30000);

        // Set up connection timeout (2 minutes)
        roomInfo.connectionTimeout = setTimeout(() => {
            const room = activeRooms.get(roomId);
            if (room && room.status !== 'connected') {
                console.log(`Room ${roomId} timed out without establishing connection`);
                cleanupRoom(roomId, socket1, socket2);
            }
        }, 120000);

        // Notify both users about the match
        socket1.emit('match-found', { room: roomId });
        socket2.emit('match-found', { room: roomId });
        
        console.log(`Created room ${roomId} for language ${language} with roles:`, roomInfo.roles);
        return roomId;
    } catch (error) {
        console.error('Failed to create room:', error);
        socket1.emit('error', { message: 'Failed to create room' });
        socket2.emit('error', { message: 'Failed to create room' });
        throw error;
    }
}

function cleanupRoom(roomId, socket1, socket2) {
    const room = activeRooms.get(roomId);
    if (!room) return;

    // Clear any pending timeouts
    if (room.negotiationTimeout) {
        clearTimeout(room.negotiationTimeout);
    }
    if (room.connectionTimeout) {
        clearTimeout(room.connectionTimeout);
    }

    // Notify users in the room
    if (socket1) {
        socket1.emit('room-closed', { reason: 'Connection timeout' });
        socket1.leave(roomId);
    }
    if (socket2) {
        socket2.emit('room-closed', { reason: 'Connection timeout' });
        socket2.leave(roomId);
    }

    // Remove room from active rooms
    activeRooms.delete(roomId);
    console.log(`Cleaned up room: ${roomId}`);
}

module.exports = { handleSignaling };
