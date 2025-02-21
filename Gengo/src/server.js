const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const twilio = require('twilio');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Initialize Twilio client
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Endpoint to get Twilio ICE servers
app.get('/api/get-ice-servers', async (req, res) => {
    try {
        const token = await twilioClient.tokens.create();
        res.json(token.iceServers);
    } catch (error) {
        console.error('Error fetching ICE servers:', error);
        res.status(500).json({ error: 'Failed to fetch ICE servers' });
    }
});

// Handle signaling through Socket.IO
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    socket.on('join', (data) => {
        // Your existing join logic
    });

    socket.on('offer', (data) => {
        // Your existing offer logic
    });

    socket.on('answer', (data) => {
        // Your existing answer logic
    });

    socket.on('ice-candidate', (data) => {
        // Your existing ICE candidate logic
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        // Your existing disconnect logic
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});