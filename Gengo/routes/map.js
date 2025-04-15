const express = require('express');
const router = express.Router();

// Endpoint to provide map configuration
router.get('/config', (req, res) => {
    try {
        const config = {
            accessToken: process.env.MAPBOX_ACCESS_TOKEN,
            style: process.env.MAPBOX_STYLE || 'mapbox://styles/mapbox/light-v11',
            center: JSON.parse(process.env.MAPBOX_DEFAULT_CENTER || '[0, 20]'),
            zoom: parseInt(process.env.MAPBOX_DEFAULT_ZOOM || '2')
        };

        if (!config.accessToken) {
            // Return a response indicating Mapbox features are unavailable
            return res.status(503).json({
                error: 'Mapbox features temporarily unavailable',
                message: 'Map functionality is currently disabled. Please try again later.',
                fallback: {
                    message: 'Interactive map features are currently unavailable. Basic flashcard functionality remains accessible.'
                }
            });
        }

        res.json(config);
    } catch (error) {
        console.error('Error providing map configuration:', error);
        res.status(500).json({
            error: 'Failed to provide map configuration',
            message: 'An error occurred while configuring the map.',
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