const users = new Map();
const activeRooms = new Map();

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
            
            const room = `${language}-${Date.now()}`;
            
            // Join room
            socket.join(room);
            otherSocket.join(room);
            
            // Emit match-found event with room info
            socket.emit('match-found', { room, role });
            otherSocket.emit('match-found', { room, role: role === 'practice' ? 'coach' : 'practice' });
            
            activeRooms.set(room, {
                users: [socket.id, otherSocket.id],
                language,
                roles: {
                    [socket.id]: role,
                    [otherSocket.id]: role === 'practice' ? 'coach' : 'practice'
                },
                startTime: Date.now()
            });
    
            console.log(`Matched users in room ${room} - ${role} with ${role === 'practice' ? 'coach' : 'practice'}`);
        } else {
            users.set(userKey, socket);
            console.log(`User ${socket.id} waiting for ${role === 'practice' ? 'coach' : 'practice'}`);
        }
    });

    socket.on('offer', ({ offer, room }) => {
        if (activeRooms.has(room)) {
            console.log(`Forwarding offer in room: ${room}`);
            socket.to(room).emit('offer', { offer, room });
        }
    });

    socket.on('answer', ({ answer, room }) => {
        if (activeRooms.has(room)) {
            console.log(`Forwarding answer in room: ${room}`);
            socket.to(room).emit('answer', { answer, room });
        }
    });

    socket.on('ice-candidate', ({ candidate, room }) => {
        if (activeRooms.has(room)) {
            console.log(`Forwarding ICE candidate in room: ${room}`);
            socket.to(room).emit('ice-candidate', { candidate, room });
        }
    });

    socket.on('disconnect', () => {
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

module.exports = { handleSignaling };
