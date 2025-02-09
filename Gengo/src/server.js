const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { handleSignaling } = require('./signaling');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            'https://www.gengo.live',
            'https://gengo-socket-production.up.railway.app',
            'https://gengo-production.up.railway.app',
            ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:9000', 'http://localhost:3000'] : [])
        ];
        
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log('Blocked origin:', origin);
            callback(null, true); // Temporarily allow all origins while debugging
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins temporarily
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.static(path.join(__dirname, '../dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    handleSignaling(socket, io);

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'Reason:', reason);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${isProduction ? 'production' : 'development'} mode`);
});

// Error handling
server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});