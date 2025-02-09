const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://www.gengo.live', 'https://gengo.live']
        : ['http://localhost:9000', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept'],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../dist'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Socket.IO Configuration
const io = new Server(server, {
    cors: corsOptions,
    path: '/socket.io/',
    serveClient: false
});

// Signaling logic
const { handleSignaling } = require('./signaling');
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    handleSignaling(socket, io);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
