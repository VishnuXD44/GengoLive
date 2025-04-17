class LanguageGenerator {
    constructor() {
        this.API_URL = '/api/generate'; // You'll need to set up this endpoint on your server
    }

    async generatePhrases(query, language, country) {
        try {
            const prompt = this.createPrompt(query, language, country);
            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) {
                throw new Error('Failed to generate phrases');
            }

            const data = await response.json();
            return this.parseResponse(data.response);
        } catch (error) {
            console.error('Error generating phrases:', error);
            throw error;
        }
    }

    createPrompt(query, language, country) {
        return `Generate 5 useful phrases in ${language} for a tourist in ${country} who wants to ${query}. 
                For each phrase, provide:
                1. The phrase in English
                2. The translation in ${language}
                3. The pronunciation guide in English
                Format each phrase as: English | Native | Pronunciation
                Keep the phrases practical, polite, and culturally appropriate.`;
    }

    parseResponse(response) {
        // Split the response into lines and parse each phrase
        const lines = response.split('\n').filter(line => line.trim());
        
        return lines.map(line => {
            const [english, native, pronunciation] = line.split('|').map(s => s.trim());
            return {
                front: english,
                back: `${native}\n\nPronunciation: ${pronunciation}`,
                native: native,
                pronunciation: pronunciation
            };
        });
    }
}

export default new LanguageGenerator(); 