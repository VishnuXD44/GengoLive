const users = new Map();

function handleSignaling(socket, io) {
    socket.on('join', ({ language, role }) => {
        console.log(`User joined with language: ${language}, role: ${role}`);
        const matchKey = `${language}-${role === 'practice' ? 'coach' : 'practice'}`;
        const userKey = `${language}-${role}`;
        
        if (users.has(matchKey)) {
            const otherSocket = users.get(matchKey);
            users.delete(matchKey);
            
            const room = `${language}-${Date.now()}`;
            
            socket.join(room);
            otherSocket.join(room);
            
            socket.emit('match', { offer: true, room });
            otherSocket.emit('match', { offer: false, room });
        } else {
            users.set(userKey, socket);
        }
    });

    socket.on('offer', (offer, room) => {
        socket.to(room).emit('offer', offer);
    });

    socket.on('answer', (answer, room) => {
        socket.to(room).emit('answer', answer);
    });

    socket.on('candidate', (candidate, room) => {
        socket.to(room).emit('candidate', candidate);
    });

    socket.on('disconnect', () => {
        for (const [key, value] of users.entries()) {
            if (value === socket) {
                users.delete(key);
                break;
            }
        }
    });
}

module.exports = { handleSignaling };