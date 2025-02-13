const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { handleSignaling } = require('./signaling');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Updated allowed origins
const allowedOrigins = [
    'https://gengo.live',
    'https://www.gengo.live',
    'http://localhost:3000',
    'http://localhost:9000',
    'https://gengo.fly.dev',
];

// Middleware to handle www to non-www redirect
app.use((req, res, next) => {
    if (req.hostname.startsWith('www.')) {
        const newHost = req.hostname.slice(4);
        return res.redirect(301, `${req.protocol}://${newHost}${req.originalUrl}`);
    }
    next();
});

// Updated CORS configuration
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
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Serve static files with proper caching
app.use(express.static(path.join(__dirname, '../dist'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

// Socket.IO configuration
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    allowUpgrades: true
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    handleSignaling(socket, io);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});