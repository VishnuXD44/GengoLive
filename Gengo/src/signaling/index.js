// filepath: /c:/Users/vishn/Gengo/Gengo/src/signaling/index.js
const users = {};

function handleSignaling(socket, io) {
    socket.on('join', ({ language, role }) => {
        console.log(`User joined with language: ${language}, role: ${role}`);
        const key = `${language}-${role === 'practice' ? 'coach' : 'practice'}`;
        if (users[key]) {
            const otherSocket = users[key];
            delete users[key];
            socket.emit('match', { offer: true });
            otherSocket.emit('match', { offer: false });
        } else {
            users[`${language}-${role}`] = socket;
        }
    });

    socket.on('offer', (offer) => {
        console.log('Received offer');
        socket.broadcast.emit('offer', offer);
    });

    socket.on('answer', (answer) => {
        console.log('Received answer');
        socket.broadcast.emit('answer', answer);
    });

    socket.on('candidate', (candidate) => {
        console.log('Received candidate');
        socket.broadcast.emit('candidate', candidate);
    });
}

module.exports = { handleSignaling };