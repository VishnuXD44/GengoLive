require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const agoraTokenRouter = require('./routes/agoraToken');
const flashcardsRouter = require('./routes/flashcards');
const mapRouter = require('./routes/map');

// Verify required environment variables
const requiredEnvVars = [
    'AGORA_APP_ID',
    'AGORA_APP_CERTIFICATE'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(express.json());
app.use(express.static('dist'));  // Updated to serve from dist directory
app.use('/api', agoraTokenRouter);
app.use('/api/flashcards', flashcardsRouter);
app.use('/api/map', mapRouter);

// Add this middleware to handle clean URLs without .html extension
app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  // Skip for files that already have extensions or API routes
  if (page.includes('.') || page === 'api') {
    return next();
  }
  
  // Try to serve the HTML file
  res.sendFile(path.join(__dirname, '../dist', `${page}.html`), err => {
    if (err) {
      next(); // If file doesn't exist, continue to next middleware
    }
  });
});

// Constants
const ROOM_TIMEOUT = 1000 * 60 * 60; // 1 hour
const waitingQueue = {
    practice: new Map(),
    coach: new Map()
};
const activeRooms = new Map();

// Helper functions
function createRoom(socket1, socket2, language) {
    const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create room data
    activeRooms.set(roomId, {
        users: [socket1.id, socket2.id],
        language,
        lastActivity: Date.now()
    });

    // Join both users to the room
    socket1.join(roomId);
    socket2.join(roomId);

    // Notify users about the match
    socket1.emit('match-found', {
        room: roomId,
        role: socket1.userData.role,
        peerRole: socket2.userData.role
    });

    socket2.emit('match-found', {
        room: roomId,
        role: socket2.userData.role,
        peerRole: socket1.userData.role
    });
}

function removeFromQueue(socket) {
    if (!socket.userData) return;

    const { language, role } = socket.userData;
    const queue = waitingQueue[role].get(language);
    
    if (queue) {
        const index = queue.findIndex(s => s.id === socket.id);
        if (index !== -1) {
            queue.splice(index, 1);
        }
    }
}

function cleanupRoom(roomId, ...sockets) {
    // Notify users about room closure
    sockets.forEach(socket => {
        if (socket) {
            socket.emit('room-closed', { reason: 'Session ended' });
            socket.leave(roomId);
        }
    });

    // Remove room data
    activeRooms.delete(roomId);
}

// Socket handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', ({ language, role }) => {
        console.log(`User ${socket.id} joining as ${role} for ${language}`);
        
        // Store user data
        socket.userData = { language, role };
        
        // Initialize queue for this language if it doesn't exist
        if (!waitingQueue[role].has(language)) {
            waitingQueue[role].set(language, []);
        }

        const oppositeRole = role === 'practice' ? 'coach' : 'practice';
        const oppositeQueue = waitingQueue[oppositeRole].get(language) || [];

        if (oppositeQueue.length > 0) {
            // Match found
            const peer = oppositeQueue.shift();
            createRoom(socket, peer, language);
        } else {
            // Add to waiting queue
            waitingQueue[role].get(language).push(socket);
            socket.emit('waiting');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        removeFromQueue(socket);

        // Handle room cleanup
        for (const [roomId, room] of activeRooms.entries()) {
            if (room.users.includes(socket.id)) {
                const otherUser = room.users.find(id => id !== socket.id);
                cleanupRoom(roomId, io.sockets.sockets.get(otherUser), socket);
            }
        }
    });
});

// Room cleanup interval
setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of activeRooms.entries()) {
        if (now - room.lastActivity > ROOM_TIMEOUT) {
            const users = room.users.map(id => io.sockets.sockets.get(id)).filter(Boolean);
            cleanupRoom(roomId, ...users);
        }
    }
}, 60000); // Check every minute

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
