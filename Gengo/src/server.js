const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { handleSignaling } = require('./signaling');

const app = express();
const server = http.createServer(app);

// Updated Socket.IO configuration
const io = socketIo(server, {
    cors: {
        origin: ["https://www.gengo.live", "http://localhost:3000"],
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    allowUpgrades: true,
    cookie: false
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Enable CORS
app.use(cors({
    origin: ["https://www.gengo.live", "http://localhost:3000"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
}));

// Socket.IO error handling
io.engine.on("connection_error", (err) => {
    console.log(err.req);      // the request object
    console.log(err.code);     // the error code, for example 1
    console.log(err.message);  // the error message, for example "Session ID unknown"
    console.log(err.context);  // some additional error context
});

io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('error', (error) => {
        console.log('Socket error:', error);
    });

    handleSignaling(socket, io);

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', reason);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
