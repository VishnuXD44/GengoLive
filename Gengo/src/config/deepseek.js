import axios from 'axios';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1';

if (!DEEPSEEK_API_KEY) {
    throw new Error('Missing Deepseek API key');
}

const deepseekClient = axios.create({
    baseURL: DEEPSEEK_API_URL,
    headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

export const generateFlashcardContent = async (prompt, targetLanguage) => {
    try {
        const response = await deepseekClient.post('/chat/completions', {
            model: 'deepseek-chat',
            messages: [
                {
                    role: 'system',
                    content: `You are a language learning assistant. Generate a flashcard with the following format:
                    Front: The phrase in English
                    Back: The translation in ${targetLanguage}
                    Make sure the translation is accurate and culturally appropriate.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error generating flashcard content:', error);
        throw error;
    }
}; 