const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { handleSignaling } = require('./signaling');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://www.gengo.live", // Replace with your domain
        methods: ["GET", "POST"]
    }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Enable CORS
app.use(cors({
    origin: "https://www.gengo.live" // Replace with your domain
}));

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