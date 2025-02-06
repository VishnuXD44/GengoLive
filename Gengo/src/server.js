// filepath: /c:/Users/vishn/Gengo/Gengo/src/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { handleSignaling } = require('./signaling');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('New client connected');
    handleSignaling(socket, io);

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});