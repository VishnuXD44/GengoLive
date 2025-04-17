class LanguageGenerator {
    constructor() {
        this.API_URL = '/api/language/generate';
    }

    async generatePhrases(query, language, country) {
        try {
            console.log('Generating phrases for:', { query, language, country });
            const prompt = this.createPrompt(query, language, country);
            console.log('Generated prompt:', prompt);

            const response = await fetch(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt })
            });

            console.log('API Response status:', response.status);
            
            if (!response.ok) {
                const error = await response.json();
                console.error('API Error response:', error);
                throw new Error(error.error || 'Failed to generate phrases');
            }

            const data = await response.json();
            console.log('API Response data:', data);

            if (!data.success) {
                throw new Error(data.error || 'Failed to generate phrases');
            }

            const parsedPhrases = this.parseResponse(data.response);
            console.log('Parsed phrases:', parsedPhrases);
            return parsedPhrases;

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
                Keep the phrases practical, polite, and culturally appropriate.
                IMPORTANT: Each line must contain exactly two | characters to separate the three parts.`;
    }

    parseResponse(response) {
        try {
            console.log('Raw response to parse:', response);
            // Split the response into lines and parse each phrase
            const lines = response.split('\n').filter(line => {
                const isValid = line.trim() && line.includes('|');
                if (!isValid) {
                    console.log('Filtered out invalid line:', line);
                }
                return isValid;
            });
            
            console.log('Valid lines found:', lines);

            return lines.map(line => {
                const parts = line.split('|').map(s => s.trim());
                console.log('Parsed line parts:', parts);

                const [english, native, pronunciation] = parts;
                if (!english || !native || !pronunciation) {
                    console.warn('Invalid phrase format:', line);
                    return null;
                }
                return {
                    front: english,
                    back: `${native}\n\nPronunciation: ${pronunciation}`,
                    native: native,
                    pronunciation: pronunciation
                };
            }).filter(phrase => phrase !== null);
        } catch (error) {
            console.error('Error parsing response:', error);
            throw new Error('Failed to parse generated phrases');
        }
    }
}

export default new LanguageGenerator(); 