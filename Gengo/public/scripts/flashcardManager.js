import { createClient } from '@supabase/supabase-js';
import authHandler from './auth.js';

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const defaultCategory = process.env.DEFAULT_FLASHCARD_CATEGORY || 'greetings';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase environment variables are not set');
    throw new Error('Supabase configuration is missing. Please check your environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

class FlashcardManager {
    constructor() {
        this.supabase = supabase;
        this.currentUser = null;
        this.defaultCategory = defaultCategory;
        
        // Listen for auth state changes
        authHandler.onAuthStateChange(async (user) => {
            this.currentUser = user;
            if (user) {
                // Check if user has any flashcards
                const { data } = await this.supabase
                    .from('user_flashcards')
                    .select('id')
                    .eq('user_id', user.id)
                    .limit(1);
                
                // If no flashcards exist, initialize with defaults
                if (!data || data.length === 0) {
                    await this.initializeDefaultFlashcards();
                }
            }
        });
    }

    // Initialize default flashcards for new users
    async initializeDefaultFlashcards() {
        if (!this.currentUser) return;

        const defaultFlashcards = {
            greetings: [
                { front: "Hello", back: "Hello" },
                { front: "Thank you", back: "Thank you" },
                { front: "You're welcome", back: "You're welcome" },
                { front: "Goodbye", back: "Goodbye" },
                { front: "Good morning", back: "Good morning" }
            ],
            food: [
                { front: "Can I have the menu?", back: "Can I have the menu?" },
                { front: "The bill, please", back: "The bill, please" },
                { front: "Is this dish spicy?", back: "Is this dish spicy?" },
                { front: "I am vegetarian", back: "I am vegetarian" },
                { front: "Water, please", back: "Water, please" }
            ],
            transportation: [
                { front: "Where is the train station?", back: "Where is the train station?" },
                { front: "How much is the fare?", back: "How much is the fare?" },
                { front: "One ticket, please", back: "One ticket, please" },
                { front: "When is the next train?", back: "When is the next train?" },
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

        try {
            for (const [category, cards] of Object.entries(defaultFlashcards)) {
                const flashcardsToInsert = cards.map(card => ({
                    user_id: this.currentUser.id,
                    front_text: card.front,
                    back_text: card.back,
                    category: category,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }));

                const { error } = await this.supabase
                    .from('user_flashcards')
                    .insert(flashcardsToInsert);

                if (error) throw error;
            }
        } catch (error) {
            console.error('Error initializing default flashcards:', error);
        }
    }

    // Get user's flashcards for a specific category
    async getFlashcards(category = null) {
        if (!this.currentUser) return { success: false, error: 'Not authenticated' };

        try {
            let query = this.supabase
                .from('user_flashcards')
                .select('*')
                .eq('user_id', this.currentUser.id);

            if (category) {
                query = query.eq('category', category);
            }

            const { data, error } = await query;
            if (error) throw error;

            return { success: true, flashcards: data };
        } catch (error) {
            console.error('Error fetching flashcards:', error);
            return { success: false, error: error.message };
        }
    }

    // Add a new flashcard
    async addFlashcard(flashcardData) {
        if (!this.currentUser) return { success: false, error: 'Not authenticated' };

        try {
            const { data, error } = await this.supabase
                .from('user_flashcards')
                .insert({
                    user_id: this.currentUser.id,
                    ...flashcardData,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, flashcard: data };
        } catch (error) {
            console.error('Error adding flashcard:', error);
            return { success: false, error: error.message };
        }
    }

    // Update flashcard
    async updateFlashcard(flashcardId, updates) {
        if (!this.currentUser) return { success: false, error: 'Not authenticated' };

        try {
            const { data, error } = await this.supabase
                .from('user_flashcards')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', flashcardId)
                .eq('user_id', this.currentUser.id)
                .select()
                .single();

            if (error) throw error;
            return { success: true, flashcard: data };
        } catch (error) {
            console.error('Error updating flashcard:', error);
            return { success: false, error: error.message };
        }
    }

    // Delete flashcard
    async deleteFlashcard(flashcardId) {
        if (!this.currentUser) return { success: false, error: 'Not authenticated' };

        try {
            const { error } = await this.supabase
                .from('user_flashcards')
                .delete()
                .eq('id', flashcardId)
                .eq('user_id', this.currentUser.id);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error deleting flashcard:', error);
            return { success: false, error: error.message };
        }
    }

    // Get user's progress
    async getUserProgress(category = null) {
        if (!this.currentUser) return { success: false, error: 'Not authenticated' };

        try {
            let query = this.supabase
                .from('user_progress')
                .select('*')
                .eq('user_id', this.currentUser.id);

            if (category) {
                query = query.eq('category', category);
            }

            const { data, error } = await query;
            if (error) throw error;

            return { success: true, progress: data };
        } catch (error) {
            console.error('Error fetching progress:', error);
            return { success: false, error: error.message };
        }
    }

    // Update user's progress
    async updateProgress(category, updates) {
        if (!this.currentUser) return { success: false, error: 'Not authenticated' };

        try {
            const { data, error } = await this.supabase
                .from('user_progress')
                .upsert({
                    user_id: this.currentUser.id,
                    category,
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, progress: data };
        } catch (error) {
            console.error('Error updating progress:', error);
            return { success: false, error: error.message };
        }
    }
}

// Create and export singleton instance
const flashcardManager = new FlashcardManager();
export default flashcardManager; 