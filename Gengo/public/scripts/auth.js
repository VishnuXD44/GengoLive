import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const requireInvite = process.env.AUTH_REQUIRE_INVITE === 'true';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase environment variables are not set');
    throw new Error('Supabase configuration is missing. Please check your environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

class AuthHandler {
    constructor() {
        this.supabase = supabase;
        this.currentUser = null;
        this.authStateListeners = new Set();
        this.requireInvite = requireInvite;
    }

    // Initialize auth state
    async init() {
        try {
            const { data: { session }, error } = await this.supabase.auth.getSession();
            if (error) throw error;

            if (session) {
                this.currentUser = session.user;
                this.notifyListeners();
            }

            // Listen for auth state changes
            this.supabase.auth.onAuthStateChange((event, session) => {
                this.currentUser = session?.user || null;
                this.notifyListeners();
            });
        } catch (error) {
            console.error('Error initializing auth:', error);
        }
    }

    // Sign in with email and password
    async signIn(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return { success: true, user: data.user };
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }
    }

    // Sign out
    async signOut() {
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get current user profile
    async getUserProfile() {
        if (!this.currentUser) return null;

        try {
            const { data, error } = await this.supabase
                .from('user_profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
    }

    // Update user profile
    async updateProfile(profileData) {
        if (!this.currentUser) return { success: false, error: 'Not authenticated' };

        try {
            const { data, error } = await this.supabase
                .from('user_profiles')
                .upsert({
                    id: this.currentUser.id,
                    ...profileData,
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, profile: data };
        } catch (error) {
            console.error('Error updating profile:', error);
            return { success: false, error: error.message };
        }
    }

    // Add auth state change listener
    onAuthStateChange(listener) {
        this.authStateListeners.add(listener);
        // Initial call with current state
        listener(this.currentUser);
        return () => this.authStateListeners.delete(listener);
    }

    // Notify all listeners of auth state change
    notifyListeners() {
        this.authStateListeners.forEach(listener => listener(this.currentUser));
    }
}

// Create and export singleton instance
const authHandler = new AuthHandler();
export default authHandler; 