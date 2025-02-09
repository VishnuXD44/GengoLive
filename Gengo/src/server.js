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

// CORS middleware configuration
const allowedOrigins = [
    'https://www.gengo.live',
    'https://gengolive-production.up.railway.app',
    'http://localhost:9000',
    'http://localhost:3000'
];

const corsOptions = {
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log('Blocked origin:', origin);
            callback(null, true); // Allow all origins during development
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
};

app.use(cors(corsOptions));

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: true
    },
    allowEIO3: true,
    transports: ['websocket', 'polling']
});

// Pre-flight requests
app.options('*', cors(corsOptions));

// Serve static files
app.use(express.static(path.join(__dirname, '../dist')));

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    handleSignaling(socket, io);
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${isProduction ? 'production' : 'development'} mode`);
});