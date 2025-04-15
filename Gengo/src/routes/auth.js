const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Sign in route
router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        res.json({
            success: true,
            session: data.session,
            user: data.user
        });

    } catch (error) {
        console.error('Sign in error:', error);
        res.status(401).json({ error: error.message });
    }
});

// Sign out route
router.post('/signout', async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Sign out error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get current session
router.get('/session', async (req, res) => {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        res.json({
            success: true,
            session
        });
    } catch (error) {
        console.error('Session error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send invite (admin only)
router.post('/invite', async (req, res) => {
    try {
        const { email } = req.body;
        
        // Get current user's session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Check if user is admin using Supabase's built-in roles
        if (session.user.role !== 'service_role') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Generate invite link using Supabase's built-in invitation
        const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Invitation sent successfully'
        });

    } catch (error) {
        console.error('Invite error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 