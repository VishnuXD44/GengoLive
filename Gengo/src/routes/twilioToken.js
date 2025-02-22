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

        const requiredEnvVars = [
            'TWILIO_ACCOUNT_SID',
            'TWILIO_API_KEY',
            'TWILIO_API_SECRET'
        ];

        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingEnvVars.length > 0) {
            console.error('Missing required environment variables:', missingEnvVars.join(', '));
            return res.status(500).json({
                error: 'Server configuration error'
            });
        }

        try {
            // Create Access Token using API Key
            const token = new AccessToken(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_API_KEY,
                process.env.TWILIO_API_SECRET
            );

            // Create Video Grant
            const videoGrant = new VideoGrant({
                room: room
            });

            // Add grant to token
            token.addGrant(videoGrant);
            token.identity = identity;

            // Return token
            res.json({ token: token.toJwt() });
        } catch (error) {
            console.error('Error generating token:', error);
            return res.status(500).json({
                error: 'Failed to generate access token'
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
