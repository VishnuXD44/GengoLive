const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { handleSignaling } = require('./signaling');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Add allowed origins
const allowedOrigins = [
    'https://www.gengo.live',
    'https://gengo.live',
    'https://px6793pa.up.railway.app',
    'https://gengolive-production.up.railway.app',
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:9000', 'http://localhost:3000'] : [])
];

// Add headers middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Socket.IO setup
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: false
    },
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'Reason:', reason);
    });

    handleSignaling(socket, io);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log('Allowed origins:', allowedOrigins);
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});