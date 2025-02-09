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

const allowedOrigins = [
    'https://www.gengo.live',
    'https://gengo-live-mhndo74fy-vishnuxd44s-projects.vercel.app',
    'https://gengolive-production.up.railway.app',
    ...(isProduction ? [] : ['http://localhost:9000', 'http://localhost:3000'])
];

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
    credentials: false // Changed to false
};

app.use(cors(corsOptions));

const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins temporarily
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: false // Changed to false
    },
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    allowEIO3: true
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