const users = new Map();

function handleSignaling(socket, io) {
    socket.on('join', ({ language, role }) => {
        console.log(`User ${socket.id} joined with language: ${language}, role: ${role}`);
        
        // Create matching keys for both roles
        const matchKey = `${language}-${role === 'practice' ? 'coach' : 'practice'}`;
        const userKey = `${language}-${role}`;
        
        // Check if there's a matching user waiting
        if (users.has(matchKey)) {
            const otherSocket = users.get(matchKey);
            users.delete(matchKey); // Remove the waiting user
            
            // Create a unique room for these two users
            const room = `${language}-${Date.now()}`;
            socket.join(room);
            otherSocket.join(room);
            
            // Notify both users about the match
            socket.emit('match', { offer: true, room });
            otherSocket.emit('match', { offer: false, room });
            
            // Log successful match
            console.log(`Matched users in room ${room}`);
        } else {
            // No match found, add user to waiting list
            users.set(userKey, socket);
            console.log(`User ${socket.id} waiting for match with key ${userKey}`);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        // Remove user from waiting list if they were waiting
        for (const [key, value] of users.entries()) {
            if (value === socket) {
                users.delete(key);
                console.log(`Removed disconnected user from waiting list: ${key}`);
                break;
            }
        }
        // Notify peers in any rooms
        socket.broadcast.emit('user-disconnected', socket.id);
    });

    // Handle WebRTC signaling
    socket.on('offer', (offer, room) => {
        console.log(`Sending offer in room: ${room}`);
        socket.to(room).emit('offer', offer);
    });

    socket.on('answer', (answer, room) => {
        console.log(`Sending answer in room: ${room}`);
        socket.to(room).emit('answer', answer);
    });

    socket.on('candidate', (candidate, room) => {
        console.log(`Sending ICE candidate in room: ${room}`);
        socket.to(room).emit('candidate', candidate);
    });
}

module.exports = { handleSignaling };