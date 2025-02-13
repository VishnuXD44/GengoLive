const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { handleSignaling } = require('./signaling');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000; // Changed port to 3001

// Allowed origins for development
const allowedOrigins = [
    'http://localhost:9000',
    'http://localhost:3000'
];

// Use CORS middleware with specific options
app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Additional headers for better browser support
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Permissions-Policy', 'camera=*, microphone=*, geolocation=()');
    next();
});

// Updated Socket.IO configuration
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: false,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    cookie: false,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e8,
    allowUpgrades: true,
    perMessageDeflate: {
        threshold: 1024
    },
    httpCompression: {
        threshold: 1024
    }
});

// Serve static files with proper headers
app.use(express.static(path.join(__dirname, '../dist'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Socket connection handling with improved error handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        socket.emit('error', { message: 'An error occurred' });
    });

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, 'Reason:', reason);
        handleCleanup(socket);
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        socket.emit('reconnect_attempt');
    });

    handleSignaling(socket, io);
});

function handleCleanup(socket) {
    try {
        const rooms = Array.from(socket.rooms);
        rooms.forEach(room => {
            socket.to(room).emit('peer_disconnected');
        });
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Improved server error handling
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log('Allowed origins:', allowedOrigins);
});

server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Performing graceful shutdown...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});