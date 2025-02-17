const users = new Map();
const activeRooms = new Map(); // Track active connections

function handleSignaling(socket, io) {
        socket.on('join', ({ language, role }) => {
        console.log(`User ${socket.id} joined with language: ${language}, role: ${role}`);
        
        // Create matching keys - ensure correct pairing
        const matchKey = `${language}-${role === 'practice' ? 'coach' : 'practice'}`;
        const userKey = `${language}-${role}`;
        
        // Check for existing match
        if (users.has(matchKey)) {
            const otherSocket = users.get(matchKey);
            users.delete(matchKey);
            
            // Create room and store both users
            const room = `${language}-${Date.now()}`;
            
            // Important: Always make 'practice' user initiate the offer
            const isPractice = role === 'practice';
            socket.emit('match', { 
                offer: isPractice, 
                room,
                role: role
            });
            otherSocket.emit('match', { 
                offer: !isPractice, 
                room,
                role: role === 'practice' ? 'coach' : 'practice'
            });
    
            // Join room after emitting match
            socket.join(room);
            otherSocket.join(room);
            
            activeRooms.set(room, {
                users: [socket.id, otherSocket.id],
                language,
                roles: {
                    [socket.id]: role,
                    [otherSocket.id]: role === 'practice' ? 'coach' : 'practice'
                },
                startTime: Date.now()
            });
    
            console.log(`Matched: ${role} user with ${role === 'practice' ? 'coach' : 'practice'} in room ${room}`);
        } else {
            // Add to waiting list
            users.set(userKey, socket);
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
            const roomInfo = activeRooms.get(room);
            const otherUser = roomInfo.users.find(id => id !== socket.id);
            if (otherUser) {
                io.to(otherUser).emit('candidate', candidate);
            }
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