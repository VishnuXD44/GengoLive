const users = new Map();
const activeRooms = new Map(); // Track active connections

function handleSignaling(socket, io) {
    socket.on('join', ({ language, role }) => {
        console.log(`User ${socket.id} joined with language: ${language}, role: ${role}`);
        
        // Create matching keys
        const matchKey = `${language}-${role === 'practice' ? 'coach' : 'practice'}`;
        const userKey = `${language}-${role}`;
        
        // Check for existing match
        if (users.has(matchKey)) {
            const otherSocket = users.get(matchKey);
            users.delete(matchKey);
            
            // Create and store room info
            const room = `${language}-${Date.now()}`;
            activeRooms.set(room, {
                users: [socket.id, otherSocket.id],
                language,
                startTime: Date.now()
            });

            // Join room and notify
            socket.join(room);
            otherSocket.join(room);
            
            // Ensure proper offer/answer flow
            const initiator = Math.random() < 0.5; // Randomize who initiates
            socket.emit('match', { offer: initiator, room });
            otherSocket.emit('match', { offer: !initiator, room });
            
            console.log(`Matched users in room ${room} (${initiator ? 'A->B' : 'B->A'})`);
        } else {
            // Add to waiting list
            users.set(userKey, socket);
            console.log(`User ${socket.id} waiting (${userKey})`);
            
            // Notify user they're waiting
            socket.emit('waiting', { language, role });
        }
    });

    socket.on('disconnect', () => {
        // Clean up waiting list
        for (const [key, value] of users.entries()) {
            if (value === socket) {
                users.delete(key);
                console.log(`Removed waiting user: ${socket.id}`);
                break;
            }
        }

        // Clean up active rooms
        for (const [room, info] of activeRooms.entries()) {
            if (info.users.includes(socket.id)) {
                const otherUser = info.users.find(id => id !== socket.id);
                if (otherUser) {
                    io.to(otherUser).emit('user-disconnected');
                }
                activeRooms.delete(room);
                console.log(`Cleaned up room: ${room}`);
            }
        }
    });

    // Enhanced WebRTC signaling
    socket.on('offer', (offer, room) => {
        if (activeRooms.has(room)) {
            console.log(`Processing offer in room: ${room}`);
            socket.to(room).emit('offer', offer);
        }
    });

    socket.on('answer', (answer, room) => {
        if (activeRooms.has(room)) {
            console.log(`Processing answer in room: ${room}`);
            socket.to(room).emit('answer', answer);
        }
    });

    socket.on('candidate', (candidate, room) => {
        if (activeRooms.has(room)) {
            console.log(`Processing ICE candidate in room: ${room}`);
            socket.to(room).emit('candidate', candidate);
        }
    });

    // Add connection status tracking
    socket.on('connection-status', ({ room, status }) => {
        if (activeRooms.has(room)) {
            const roomInfo = activeRooms.get(room);
            roomInfo.status = status;
            console.log(`Connection status in room ${room}: ${status}`);
        }
    });
}

module.exports = { handleSignaling };