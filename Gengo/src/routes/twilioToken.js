const express = require('express');
const twilio = require('twilio');
const router = express.Router();

const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

router.post('/token', (req, res) => {
    try {
        const { identity, room } = req.body;

        if (!identity || !room) {
            return res.status(400).json({
                error: 'Missing required parameters: identity and room'
            });
        }

        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
            console.error('Missing Twilio credentials in environment variables');
            return res.status(500).json({
                error: 'Server configuration error'
            });
        }

        // Create Twilio client
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

        // Create Access Token
        const token = new AccessToken(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_ACCOUNT_SID, // Using Account SID as API Key
            process.env.TWILIO_AUTH_TOKEN   // Using Auth Token as API Secret
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
        res.status(500).json({
            error: 'Failed to generate token'
        });
    }
});

module.exports = router;
