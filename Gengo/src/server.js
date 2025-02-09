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
            'https://gengo-production.up.railway.app',
            ...(!isProduction ? ['http://localhost:9000', 'http://localhost:3000'] : [])
        ];
        
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

const io = new Server(server, {
    cors: corsOptions,
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    cookie: false
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