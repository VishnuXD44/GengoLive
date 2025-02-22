const express = require('express');
const twilio = require('twilio');
const router = express.Router();

const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

router.post('/token', async (req, res) => {
    try {
        const { identity, room } = req.body;

        if (!identity || !room) {
            return res.status(400).json({
                error: 'Missing required parameters: identity and room'
            });
        }

        try {
            // Log environment variables (without secrets)
            console.log('Environment check:', {
                TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'Present' : 'Missing',
                TWILIO_API_KEY: process.env.TWILIO_API_KEY ? 'Present' : 'Missing',
                TWILIO_API_SECRET: process.env.TWILIO_API_SECRET ? 'Present' : 'Missing'
            });

            // Validate environment variables
            const requiredEnvVars = [
                'TWILIO_ACCOUNT_SID',
                'TWILIO_API_KEY',
                'TWILIO_API_SECRET'
            ];

            const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
            
            if (missingEnvVars.length > 0) {
                console.error('Missing required environment variables:', missingEnvVars.join(', '));
                return res.status(500).json({
                    error: 'Server configuration error: Missing environment variables'
                });
            }

            // Validate request parameters
            if (!identity || !room) {
                console.error('Missing required parameters:', { identity: !!identity, room: !!room });
                return res.status(400).json({
                    error: 'Missing required parameters: identity and room'
                });
            }

            console.log('Creating access token for:', { identity, room });

            // Create Access Token using API Key
            const token = new AccessToken(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_API_KEY,
                process.env.TWILIO_API_SECRET,
                { identity: identity }
            );

            // Create Video Grant
            const videoGrant = new VideoGrant({
                room: room
            });

            // Add grant to token
            token.addGrant(videoGrant);

            // Generate JWT
            const jwt = token.toJwt();
            console.log('Token generated successfully');

            // Return token
            res.json({ token: jwt });
        } catch (error) {
            console.error('Error generating token:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            return res.status(500).json({
                error: `Failed to generate access token: ${error.message}`
            });
        }
    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({
            error: 'Failed to generate token'
        });
    }
});

module.exports = router;
