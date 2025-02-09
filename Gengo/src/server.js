const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? 'https://www.gengo.live'
        : 'http://localhost:9000',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

// Serve static files
app.use(express.static(path.join(__dirname, '../dist'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Socket.IO setup
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? 'https://www.gengo.live'
            : 'http://localhost:9000',
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true
    },
    serveClient: false
});

// Signaling logic (from your existing index.js)
const { handleSignaling } = require('./signaling');
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    handleSignaling(socket, io);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
