const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { handleSignaling } = require('./signaling');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Updated allowed origins for Heroku
const allowedOrigins = [
    'https://gengolive-f8fb09d3fdf5.herokuapp.com',
    'http://localhost:3000',
    'http://localhost:9000'
];

// CORS configuration
app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// Socket.IO configuration
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    },
    path: '/socket.io/'
});

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    handleSignaling(socket, io);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Health check endpoint for Heroku
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});