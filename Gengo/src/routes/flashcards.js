const express = require('express');
const router = express.Router();
const { flashcardTemplates, categoryKeywords, defaultCategory } = require('../config/flashcards');

// Helper function to determine category from prompt
function determineCategory(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    
    // Check each category's keywords
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => lowerPrompt.includes(keyword))) {
            return category;
        }
    }
    
    return defaultCategory;
}

// Generate flashcards based on location and prompt
router.post('/generate', async (req, res) => {
    try {
        const { prompt, location } = req.body;

        if (!prompt || !location) {
            return res.status(400).json({ error: 'Missing prompt or location' });
        }

        // For MVP, we'll use pre-defined templates based on the prompt category
        const category = determineCategory(prompt);
        const templates = flashcardTemplates[category];

        if (!templates) {
            return res.status(400).json({ 
                error: `No templates found for category: ${category}`,
                availableCategories: Object.keys(flashcardTemplates)
            });
        }

        // Generate flashcards using templates
        const flashcards = templates.map(template => ({
            front: template.front
                .replace('{destination}', location.name)
                .replace('{food}', prompt), // Allow for food-specific customization
            back: template.back
                .replace('{destination}', location.name)
                .replace('{food}', prompt),
            location: location.name,
            coordinates: location.coordinates,
            category: category
        }));

        res.json({
            success: true,
            flashcards: flashcards,
            message: `Generated ${flashcards.length} flashcards for ${location.name}`
        });

    } catch (error) {
        console.error('Error generating flashcards:', error);
        res.status(500).json({ error: 'Failed to generate flashcards' });
    }
});

module.exports = router; 