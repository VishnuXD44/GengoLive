const users = new Map();
const activeRooms = new Map();
const waitingQueue = {
    practice: new Map(), // language -> [users]
    coach: new Map()     // language -> [users]
};

// Configuration constants
const ROOM_TIMEOUT = 1000 * 60 * 60; // 1 hour
const VALID_LANGUAGES = ['english', 'spanish', 'japanese', 'korean', 'french', 'german'];
const VALID_ROLES = ['practice', 'coach'];

// Debug helper
function logQueueState() {
    console.log('\n=== Queue State ===');
    for (const role of VALID_ROLES) {
        console.log(`\n${role.toUpperCase()} Queues:`);
        const queues = waitingQueue[role];
        for (const [language, users] of queues.entries()) {
            console.log(`- ${language}: ${users.length} users waiting`);
        }
    }
    console.log('\n=== Active Rooms ===');
    console.log(`Total rooms: ${activeRooms.size}`);
    for (const [roomId, room] of activeRooms.entries()) {
        console.log(`- Room ${roomId}: ${room.language}, Status: ${room.status}`);
    }
    console.log('================\n');
}

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
        console.log(`Join request - Socket: ${socket.id}, Language: ${language}, Role: ${role}`);

        // Validate inputs
        if (!VALID_LANGUAGES.includes(language)) {
            console.warn(`Invalid language requested: ${language}`);
            socket.emit('error', { message: 'Invalid language selected' });
            return;
        }

        if (!VALID_ROLES.includes(role)) {
            console.warn(`Invalid role requested: ${role}`);
            socket.emit('error', { message: 'Invalid role selected' });
            return;
        }

        // Check if user is already in a queue or room
        if (socket.userData) {
            console.warn(`Socket ${socket.id} attempting to join while already active`);
            removeFromQueue(socket);
        }

        // Add state tracking
        socket.userData = { language, role, state: 'waiting', joinedAt: Date.now() };
        console.log(`User state initialized: ${JSON.stringify(socket.userData)}`);
        
        const oppositeRole = role === 'practice' ? 'coach' : 'practice';
        const oppositeQueue = waitingQueue[oppositeRole];

        if (oppositeQueue.has(language) && oppositeQueue.get(language).length > 0) {
            console.log(`Match found for ${socket.id} in ${language} ${oppositeRole} queue`);
            const matchedSocket = oppositeQueue.get(language).shift();
            createRoom(socket, matchedSocket, language);
        } else {
            console.log(`No immediate match, adding ${socket.id} to ${language} ${role} queue`);
            if (!waitingQueue[role].has(language)) {
                waitingQueue[role].set(language, []);
            }
            waitingQueue[role].get(language).push(socket);
            socket.emit('waiting');
            
            // Log queue state after changes
            logQueueState();
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
        // Validate sockets and their states
        if (!socket1?.connected || !socket2?.connected) {
            throw new Error('One or both sockets are not connected');
        }

        if (!socket1.userData?.role || !socket2.userData?.role) {
            throw new Error('Invalid user data for one or both sockets');
        }

        // Ensure roles are complementary
        if (socket1.userData.role === socket2.userData.role) {
            throw new Error(`Invalid role match: both users are ${socket1.userData.role}`);
        }

        const roomId = `${language}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`\n=== Creating Room ===`);
        console.log(`Room ID: ${roomId}`);
        console.log(`Language: ${language}`);
        console.log(`User 1: ${socket1.id} (${socket1.userData.role})`);
        console.log(`User 2: ${socket2.id} (${socket2.userData.role})`);
        
        // Join both sockets to the room
        socket1.join(roomId);
        socket2.join(roomId);
        
        // Update user states
        socket1.userData.state = 'matched';
        socket2.userData.state = 'matched';
        
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
            maxAttempts: 3,
            stats: {
                negotiationStartTime: Date.now(),
                connectionStartTime: null,
                iceGatheringStartTime: null,
                totalSetupTime: null
            },
            negotiationTimeout: null,
            connectionTimeout: null
        };
        
        activeRooms.set(roomId, roomInfo);

        // Set up negotiation timeout (30 seconds)
        roomInfo.negotiationTimeout = setTimeout(() => {
            const room = activeRooms.get(roomId);
            if (room && room.status === 'created') {
                console.log(`\n=== Room Negotiation Timeout ===`);
                console.log(`Room ${roomId} timed out during negotiation`);
                console.log(`Time elapsed: ${(Date.now() - room.stats.negotiationStartTime) / 1000}s`);
                console.log(`Final room state:`, JSON.stringify(room, null, 2));
                cleanupRoom(roomId, socket1, socket2, 'Negotiation timeout');
            }
        }, 30000);

        // Set up connection timeout (2 minutes)
        roomInfo.connectionTimeout = setTimeout(() => {
            const room = activeRooms.get(roomId);
            if (room && room.status !== 'connected') {
                console.log(`\n=== Room Connection Timeout ===`);
                console.log(`Room ${roomId} timed out without establishing connection`);
                console.log(`Time elapsed: ${(Date.now() - room.stats.negotiationStartTime) / 1000}s`);
                console.log(`Connection attempts: ${room.connectionAttempts}/${room.maxAttempts}`);
                console.log(`Final room state:`, JSON.stringify(room, null, 2));
                cleanupRoom(roomId, socket1, socket2, 'Connection timeout');
            }
        }, 120000);

        // Notify both users about the match with role information
        const matchInfo = {
            room: roomId,
            language,
            timeoutDuration: {
                negotiation: 30,
                connection: 120
            }
        };

        socket1.emit('match-found', {
            ...matchInfo,
            role: socket1.userData.role,
            peerRole: socket2.userData.role
        });

        socket2.emit('match-found', {
            ...matchInfo,
            role: socket2.userData.role,
            peerRole: socket1.userData.role
        });
        
        console.log(`\n=== Room Created Successfully ===`);
        console.log(`Room ID: ${roomId}`);
        console.log(`Language: ${language}`);
        console.log(`Roles: ${JSON.stringify(roomInfo.roles)}`);
        logQueueState();
        return roomId;
    } catch (error) {
        console.error('Failed to create room:', error);
        socket1.emit('error', { message: 'Failed to create room' });
        socket2.emit('error', { message: 'Failed to create room' });
        throw error;
    }
}

function cleanupRoom(roomId, socket1, socket2, reason = 'Connection timeout') {
    console.log(`\n=== Cleaning Up Room ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`Reason: ${reason}`);

    const room = activeRooms.get(roomId);
    if (!room) {
        console.log('Room not found in active rooms');
        return;
    }

    // Log final room state
    console.log('Final room state:', {
        status: room.status,
        connectionAttempts: room.connectionAttempts,
        timeElapsed: (Date.now() - room.createdAt) / 1000,
        users: room.users,
        roles: room.roles,
        stats: room.stats
    });

    // Clear any pending timeouts
    if (room.negotiationTimeout) {
        clearTimeout(room.negotiationTimeout);
        console.log('Cleared negotiation timeout');
    }
    if (room.connectionTimeout) {
        clearTimeout(room.connectionTimeout);
        console.log('Cleared connection timeout');
    }

    // Calculate final statistics
    const finalStats = {
        ...room.stats,
        totalSetupTime: (Date.now() - room.stats.negotiationStartTime) / 1000,
        finalStatus: room.status,
        reason
    };

    // Notify users in the room
    const closeInfo = {
        reason,
        roomId,
        finalState: room.status,
        duration: finalStats.totalSetupTime,
        stats: finalStats
    };

    if (socket1) {
        socket1.emit('room-closed', closeInfo);
        socket1.leave(roomId);
        socket1.userData.state = 'disconnected';
        console.log(`Notified and removed user 1: ${socket1.id}`);
    }
    if (socket2) {
        socket2.emit('room-closed', closeInfo);
        socket2.leave(roomId);
        socket2.userData.state = 'disconnected';
        console.log(`Notified and removed user 2: ${socket2.id}`);
    }

    // Remove room from active rooms
    activeRooms.delete(roomId);
    console.log(`Room ${roomId} cleaned up successfully`);
    logQueueState();
}

module.exports = { handleSignaling };
