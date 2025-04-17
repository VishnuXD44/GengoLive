// Simple list of allowed topics related to travel and language learning
const ALLOWED_TOPICS = [
    'direction',
    'food',
    'restaurant',
    'hotel',
    'transport',
    'shopping',
    'greeting',
    'emergency',
    'weather',
    'time',
    'place',
    'location',
    'help',
    'bathroom',
    'train',
    'bus',
    'taxi',
    'airport',
    'hospital',
    'pharmacy',
    'bank',
    'store',
    'market',
    'museum',
    'tourist',
    'attraction'
];

export async function isExplicit(query) {
    // Convert to lowercase for comparison
    const lowercaseQuery = query.toLowerCase();
    
    // Check if the query contains at least one allowed topic
    const hasAllowedTopic = ALLOWED_TOPICS.some(topic => 
        lowercaseQuery.includes(topic)
    );

    if (!hasAllowedTopic) {
        return true; // Consider it explicit if no allowed topics are found
    }

    // Additional checks can be added here
    // For example, checking against a list of explicit words
    // or using a content moderation API

    return false;
} 