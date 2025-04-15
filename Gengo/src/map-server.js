require('dotenv').config();
const express = require('express');
const path = require('path');
const flashcardsRouter = require('./routes/flashcards');
const mapRouter = require('./routes/map');

const app = express();

// Environment variable validation with defaults
const envConfig = {
    MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || '',
    PORT: process.env.PORT || 3001  // Using different port from main server
};

// Log missing environment variables as warnings
if (!envConfig.MAPBOX_ACCESS_TOKEN) {
    console.warn('Warning: Missing MAPBOX_ACCESS_TOKEN environment variable');
    console.warn('Map features may be limited or unavailable');
}

// Middleware
app.use(express.json());

// Serve static files from both dist and public directories
app.use(express.static('dist'));
app.use(express.static('public'));

// API routes
app.use('/api/flashcards', flashcardsRouter);
app.use('/api/map', mapRouter);

// Handle clean URLs without .html extension
app.get('/:page', (req, res, next) => {
    const page = req.params.page;
    if (page.includes('.') || page === 'api') {
        return next();
    }
    
    // Try dist directory first, then public
    res.sendFile(path.join(__dirname, '../dist', `${page}.html`), err => {
        if (err) {
            res.sendFile(path.join(__dirname, '../public', `${page}.html`), err => {
                if (err) {
                    next();
                }
            });
        }
    });
});

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(envConfig.PORT, () => {
    console.log(`Map server running on port ${envConfig.PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app; 