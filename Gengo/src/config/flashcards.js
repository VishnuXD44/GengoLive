require('dotenv').config();

// Default templates that can be overridden by environment variables
const defaultTemplates = {
    food: [
        { front: "How do I order {food}?", back: "I would like {food}, please." },
        { front: "Is this dish spicy?", back: "Is this dish spicy?" },
        { front: "I am vegetarian", back: "I am vegetarian" },
        { front: "Can I have the menu?", back: "Can I have the menu?" },
        { front: "The bill, please", back: "The bill, please" }
    ],
    greetings: [
        { front: "Hello", back: "Hello" },
        { front: "Thank you", back: "Thank you" },
        { front: "You're welcome", back: "You're welcome" },
        { front: "Goodbye", back: "Goodbye" },
        { front: "Good morning", back: "Good morning" }
    ],
    transportation: [
        { front: "Where is the train station?", back: "Where is the train station?" },
        { front: "One ticket to {destination}, please", back: "One ticket to {destination}, please" },
        { front: "What time is the next train?", back: "What time is the next train?" },
        { front: "How much is the fare?", back: "How much is the fare?" },
        { front: "Is this the right platform?", back: "Is this the right platform?" }
    ],
    emergency: [
        { front: "Help!", back: "Help!" },
        { front: "I need a doctor", back: "I need a doctor" },
        { front: "Where is the hospital?", back: "Where is the hospital?" },
        { front: "Call the police", back: "Call the police" },
        { front: "I am lost", back: "I am lost" }
    ]
};

// Try to load custom templates from environment variable
let customTemplates = {};
try {
    if (process.env.FLASHCARD_TEMPLATES) {
        customTemplates = JSON.parse(process.env.FLASHCARD_TEMPLATES);
    }
} catch (error) {
    console.warn('Failed to parse FLASHCARD_TEMPLATES environment variable, using defaults');
}

// Merge default templates with custom templates
const flashcardTemplates = {
    ...defaultTemplates,
    ...customTemplates
};

// Category keywords mapping (can be extended via environment variables)
const defaultCategoryKeywords = {
    food: ['food', 'restaurant', 'eat', 'menu', 'drink', 'cuisine'],
    greetings: ['greet', 'hello', 'basic', 'introduction', 'meet'],
    transportation: ['train', 'bus', 'transport', 'travel', 'station', 'airport'],
    emergency: ['emergency', 'help', 'hospital', 'police', 'doctor', 'urgent']
};

// Try to load custom category keywords from environment variable
let customKeywords = {};
try {
    if (process.env.FLASHCARD_CATEGORY_KEYWORDS) {
        customKeywords = JSON.parse(process.env.FLASHCARD_CATEGORY_KEYWORDS);
    }
} catch (error) {
    console.warn('Failed to parse FLASHCARD_CATEGORY_KEYWORDS environment variable, using defaults');
}

// Merge default keywords with custom keywords
const categoryKeywords = {
    ...defaultCategoryKeywords,
    ...customKeywords
};

// Default category if no match is found
const defaultCategory = process.env.DEFAULT_FLASHCARD_CATEGORY || 'greetings';

module.exports = {
    flashcardTemplates,
    categoryKeywords,
    defaultCategory
}; 