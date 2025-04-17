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
        authHandler.onAuthStateChange((user) => {
            this.currentUser = user;
        });
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