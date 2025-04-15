const express = require('express');
const router = express.Router();

// Endpoint to provide map configuration
router.get('/config', (req, res) => {
    console.log('Map config endpoint called');
    try {
        // Log environment variables (safely)
        console.log('Environment check:', {
            hasMapboxToken: !!process.env.MAPBOX_ACCESS_TOKEN,
            hasStyle: !!process.env.MAPBOX_STYLE,
            hasCenter: !!process.env.MAPBOX_DEFAULT_CENTER,
            hasZoom: !!process.env.MAPBOX_DEFAULT_ZOOM
        });

        // Validate environment variables are present
        if (!process.env.MAPBOX_ACCESS_TOKEN) {
            console.error('Mapbox access token is not configured');
            return res.status(400).json({
                error: 'Configuration Error',
                message: 'Map service is not properly configured. Please check your environment variables.',
                details: process.env.NODE_ENV === 'development' ? 'Missing MAPBOX_ACCESS_TOKEN' : undefined
            });
        }

        // Parse center coordinates with error handling
        let center;
        try {
            center = JSON.parse(process.env.MAPBOX_DEFAULT_CENTER || '[0, 20]');
        } catch (parseError) {
            console.error('Error parsing center coordinates:', parseError);
            center = [0, 20]; // fallback to default
        }

        const config = {
            accessToken: process.env.MAPBOX_ACCESS_TOKEN,
            style: process.env.MAPBOX_STYLE || 'mapbox://styles/mapbox/light-v11',
            center: center,
            zoom: parseInt(process.env.MAPBOX_DEFAULT_ZOOM || '2')
        };

        console.log('Sending map config:', {
            style: config.style,
            center: config.center,
            zoom: config.zoom,
            hasToken: !!config.accessToken
        });

        // Set proper headers
        res.setHeader('Content-Type', 'application/json');
        res.json(config);
    } catch (error) {
        console.error('Error providing map configuration:', error);
        res.status(500).json({
            error: 'Server Error',
            message: 'Failed to provide map configuration',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// POST endpoint to save a location
router.post('/save-location', async (req, res) => {
    try {
        const { name, coordinates, userId } = req.body;

        // Validate required fields
        if (!name || !coordinates || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, coordinates, or userId'
            });
        }

        // Validate coordinates format
        if (!coordinates.latitude || !coordinates.longitude) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates format. Must include latitude and longitude'
            });
        }

        // TODO: Add database integration for storing locations
        // For now, return success response
        res.json({
            success: true,
            message: 'Location saved successfully',
            data: {
                name,
                coordinates,
                userId,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error saving location:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// GET endpoint to retrieve saved locations for a user
router.get('/locations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // TODO: Add database integration for retrieving locations
        // For now, return dummy data
        res.json({
            success: true,
            data: {
                locations: [
                    {
                        name: "Example Location",
                        coordinates: {
                            latitude: 35.6762,
                            longitude: 139.6503
                        },
                        timestamp: new Date().toISOString()
                    }
                ]
            }
        });
    } catch (error) {
        console.error('Error retrieving locations:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router; 