const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

router.post('/generate', async (req, res) => {
    try {
        console.log('Received generate request:', req.body);
        const { prompt } = req.body;

        if (!prompt) {
            console.warn('Missing prompt in request');
            return res.status(400).json({ 
                success: false,
                error: 'Prompt is required' 
            });
        }

        console.log('Sending request to Deepseek API with prompt:', prompt);
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful language learning assistant that provides accurate translations and pronunciation guides for various languages.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        console.log('Deepseek API response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Deepseek API error response:', errorData);
            throw new Error('Failed to generate response from Deepseek API');
        }

        const data = await response.json();
        console.log('Deepseek API response data:', {
            status: data.status,
            messageContent: data.choices?.[0]?.message?.content?.substring(0, 100) + '...'
        });

        const responseData = { 
            success: true,
            response: data.choices[0].message.content 
        };
        console.log('Sending response to client:', {
            success: responseData.success,
            responsePreview: responseData.response.substring(0, 100) + '...'
        });

        return res.json(responseData);

    } catch (error) {
        console.error('Language generation error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to generate phrases',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router; 