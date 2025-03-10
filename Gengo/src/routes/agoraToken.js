const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const router = express.Router();

router.post('/agora-token', (req, res) => {
    try {
        const { identity, room } = req.body;

        if (!identity || !room) {
            return res.status(400).json({
                error: 'Missing required parameters: identity and room'
            });
        }

        // Log environment variables (without secrets)
        console.log('Environment check:', {
            AGORA_APP_ID: process.env.AGORA_APP_ID ? 'Present' : 'Missing',
            AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE ? 'Present' : 'Missing'
        });

        // Validate environment variables
        const requiredEnvVars = [
            'AGORA_APP_ID',
            'AGORA_APP_CERTIFICATE'
        ];

        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingEnvVars.length > 0) {
            console.error('Missing required environment variables:', missingEnvVars.join(', '));
            return res.status(500).json({
                error: 'Server configuration error: Missing environment variables'
            });
        }

        const appID = process.env.AGORA_APP_ID;
        const appCertificate = process.env.AGORA_APP_CERTIFICATE;
        const channelName = room;
        
        // Use identity as the UID (convert to a number if needed)
        const uid = Math.floor(Math.random() * 100000);
        
        // Token will expire in 3600 seconds (1 hour)
        const expirationTimeInSeconds = 3600;
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
        
        // Generate token
        const token = RtcTokenBuilder.buildTokenWithUid(
            appID, 
            appCertificate, 
            channelName, 
            uid, 
            RtcRole.PUBLISHER, 
            privilegeExpiredTs
        );

        console.log('Token generated successfully for user', identity);

        // Return token and app ID
        res.json({ 
            token: token,
            appId: appID,
            uid: uid,
            channel: channelName
        });

    } catch (error) {
        console.error('Error generating Agora token:', error);
        res.status(500).json({
            error: 'Failed to generate token'
        });
    }
});

module.exports = router;