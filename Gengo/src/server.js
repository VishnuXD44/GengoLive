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
    'https://gengolive-production.up.railway.app',
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:9000', 'http://localhost:3000'] : [])
];

// CORS configuration
const corsOptions = {
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log('Blocked origin:', origin);
            callback(null, true); // Allow all origins temporarily for debugging
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
};

app.use(cors(corsOptions));

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, '../dist')));

// Socket.IO setup
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: false
    },
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

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

// Serve index.html for all routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
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