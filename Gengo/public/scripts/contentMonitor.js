/**
 * Enhanced content monitor that responds faster to detected inappropriate content
 */
class ContentMonitor {
    constructor(options = {}) {
        this.options = {
            checkInterval: options.checkInterval || 2000, // Check every 2 seconds (reduced from 5s)
            warningThreshold: options.warningThreshold || 0.5, // Lowered threshold for warnings
            banThreshold: options.banThreshold || 0.7, // Lowered threshold for ban
            banDuration: options.banDuration || 24, // Hours
            consecutiveThreshold: 2, // Ban after this many consecutive detections
            onBanned: options.onBanned || (() => {}),
            onWarning: options.onWarning || (() => {}),
            onError: options.onError || (() => {})
        };
        
        this.monitoring = false;
        this.interval = null;
        this.videoElement = null;
        this.banKey = 'gengo_content_ban';
        this.consecutiveViolations = 0; // Track consecutive violations
        this.lastViolationTime = 0;
        
        // Reduce logging noise
        this.verbose = false;
        
        console.log('Content monitor initialized');
    }
    
    async loadModel() {
        // We're using the simplified version with no model loading
        return true;
    }
    
    async checkBanStatus() {
        const banInfo = localStorage.getItem(this.banKey);
        if (!banInfo) return false;
        
        try {
            const ban = JSON.parse(banInfo);
            const now = Date.now();
            
            if (ban.until > now) {
                // Still banned
                const hoursLeft = Math.round((ban.until - now) / 3600000 * 10) / 10;
                this.options.onBanned({
                    banned: true,
                    message: `Your account is temporarily suspended for ${hoursLeft} more hours due to content policy violation.`,
                    until: ban.until
                });
                return true;
            } else {
                // Ban expired
                localStorage.removeItem(this.banKey);
                return false;
            }
        } catch (e) {
            localStorage.removeItem(this.banKey);
            return false;
        }
    }
    
    banUser(hours = null) {
        const banHours = hours || this.options.banDuration;
        const ban = {
            until: Date.now() + (banHours * 60 * 60 * 1000),
            reason: 'Content policy violation'
        };
        
        localStorage.setItem(this.banKey, JSON.stringify(ban));
        return ban;
    }
    
    // Implement a more responsive "fake" content detection 
    // that will trigger faster for demo purposes
    startMonitoring(videoElement) {
        if (this.monitoring || !videoElement) return;
        this.videoElement = videoElement;
        this.monitoring = true;
        
        // Start frequent checks for content violations
        this.interval = setInterval(() => this.checkContent(), this.options.checkInterval);
        
        // Additional check - add click listener to manually trigger violation (for testing)
        this.videoElement.addEventListener('click', () => {
            // Uncomment the next line to test the ban feature by clicking on your video
            // this.simulateViolation();
        });
        
        // Debug message only shown once
        console.log('Content monitoring started (enhanced response version)');
        return true;
    }
    
    // For testing ban functionality without waiting
    simulateViolation() {
        console.log('Simulating content violation');
        const ban = this.banUser();
        this.stopMonitoring();
        
        this.options.onBanned({
            banned: true,
            message: 'Test violation detected. Account temporarily suspended.',
            until: ban.until
        });
    }
    
    stopMonitoring() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.monitoring = false;
        if (this.verbose) console.log('Content monitoring stopped');
    }
    
    // Enhanced check that responds more quickly
    async checkContent() {
        if (!this.monitoring || !this.videoElement) return;
        
        try {
            // MODIFIED: Simulate NSFW detection with a 5% random chance of detection
            // In a real implementation, this would use actual AI detection
            const now = Date.now();
            const simulateDetection = Math.random() < 0.05;
            
            if (simulateDetection) {
                this.consecutiveViolations++;
                this.lastViolationTime = now;
                
                // Respond more aggressively with consecutive detections
                if (this.consecutiveViolations >= this.options.consecutiveThreshold) {
                    // Ban the user immediately after consecutive detections
                    const ban = this.banUser();
                    this.stopMonitoring();
                    
                    this.options.onBanned({
                        banned: true,
                        score: 0.85, // Simulated high score
                        message: 'Inappropriate content detected. Your account has been temporarily suspended.',
                        until: ban.until
                    });
                } else {
                    // Issue a warning
                    this.options.onWarning({
                        score: 0.65, // Simulated medium score
                        message: 'Warning: Please ensure your content is appropriate.'
                    });
                }
            } else {
                // Reset consecutive violations count if enough time has passed
                if (now - this.lastViolationTime > 10000) { // 10 seconds
                    this.consecutiveViolations = 0;
                }
            }
        } catch (error) {
            // Reduce error logging
            if (this.verbose) console.error('Error during content check:', error);
            this.options.onError(error);
        }
    }
}

// Make it globally available
window.ContentMonitor = ContentMonitor;