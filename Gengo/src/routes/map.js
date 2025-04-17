const express = require('express');
const router = express.Router();

// Endpoint to get Mapbox token
router.get('/config', (req, res) => {
    try {
        const token = process.env.MAPBOX_ACCESS_TOKEN;
        if (!token) {
            throw new Error('Mapbox token not configured');
        }
        res.json({ token });
    } catch (error) {
        console.error('Mapbox config error:', error);
        res.status(500).json({ error: 'Failed to get Mapbox configuration' });
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