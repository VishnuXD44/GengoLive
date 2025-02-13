const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { handleSignaling } = require('./signaling');

const app = express();
const PORT = process.env.PORT || 3000;

// SSL configuration for HTTPS
const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/gengo.live/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/gengo.live/fullchain.pem')
};

const httpServer = http.createServer(app);
const httpsServer = https.createServer(sslOptions, app);

// Allowed origins
const allowedOrigins = [
    'https://gengo.live',
    'https://www.gengo.live',
    'http://localhost:3000',
    'http://localhost:9000'
];

// Redirect HTTP to HTTPS and www to non-www
app.use((req, res, next) => {
    if (!req.secure) {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    if (req.headers.host.startsWith('www.')) {
        return res.redirect(301, `https://gengo.live${req.url}`);
    }
    next();
});

// CORS and other middleware configurations remain the same
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
    credentials: true
}));

// Socket.IO configuration
const io = new Server(httpsServer, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    },
    path: '/socket.io/'
});

// Rest of your server code remains the same...

// Listen on both HTTP and HTTPS
httpServer.listen(80, () => {
    console.log('HTTP Server running on port 80');
});

httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});