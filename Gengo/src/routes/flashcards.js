const express = require('express');
const router = express.Router();
const { supabase, isAuthenticated } = require('../config/supabase');
const { generateFlashcardContent } = require('../config/deepseek');

// Middleware to check authentication
const requireAuth = async (req, res, next) => {
    try {
        const authenticated = await isAuthenticated();
        if (!authenticated) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        next();
    } catch (error) {
        console.error('Auth check failed:', error);
        res.status(500).json({ error: 'Authentication check failed' });
    }
};

// Generate flashcards based on location and prompt
router.post('/generate', requireAuth, async (req, res) => {
    try {
        const { prompt, location, targetLanguage } = req.body;

        if (!prompt || !location || !targetLanguage) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate flashcard content using Deepseek API
        const flashcardContent = await generateFlashcardContent(prompt, targetLanguage);

        // Parse the generated content
        const [front, back] = flashcardContent.split('\n').map(line => line.trim());

        const flashcard = {
            front: front.replace('Front:', '').trim(),
            back: back.replace('Back:', '').trim(),
            location: location.name,
            coordinates: location.coordinates,
            target_language: targetLanguage,
            created_at: new Date().toISOString()
        };

        // Store the flashcard in Supabase
        const { data, error } = await supabase
            .from('flashcards')
            .insert([flashcard])
            .select();

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            flashcard: data[0],
            message: 'Flashcard generated and stored successfully'
        });

    } catch (error) {
        console.error('Error generating flashcard:', error);
        res.status(500).json({ error: 'Failed to generate flashcard' });
    }
});

// Get user's flashcards
router.get('/user', requireAuth, async (req, res) => {
    try {
        const user = await getCurrentUser();
        
        const { data, error } = await supabase
            .from('flashcards')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            flashcards: data
        });

    } catch (error) {
        console.error('Error fetching flashcards:', error);
        res.status(500).json({ error: 'Failed to fetch flashcards' });
    }
});

module.exports = router; 