const users = {};

function handleSignaling(socket, io) {
    socket.on('join', ({ language, role }) => {
        console.log(`User joined with language: ${language}, role: ${role}`);
        const key = `${language}-${role === 'practice' ? 'coach' : 'practice'}`;
        
        if (users[key]) {
            const otherSocket = users[key];
            delete users[key];
            
            const room = `${language}-${Date.now()}`;
            
            socket.join(room);
            otherSocket.join(room);
            
            socket.emit('match', { offer: true, room });
            otherSocket.emit('match', { offer: false, room });
        } else {
            users[`${language}-${role}`] = socket;
        }
    });

    // Other signaling event handlers for offer, answer, candidate
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
        // Clean up users on disconnection
        for (const key in users) {
            if (users[key] === socket) {
                delete users[key];
                break;
            }
        }
    });
}

module.exports = { handleSignaling };
