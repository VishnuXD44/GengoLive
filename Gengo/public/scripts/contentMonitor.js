/**
 * Content monitoring for detecting inappropriate content in video streams
 * Uses TensorFlow.js and NSFW.js to detect content directly in the browser
 */
class ContentMonitor {
    constructor(options = {}) {
        this.options = {
            checkInterval: options.checkInterval || 5000, // Check every 5 seconds
            warningThreshold: options.warningThreshold || 0.6,
            banThreshold: options.banThreshold || 0.8,
            banDuration: options.banDuration || 24, // Hours
            onBanned: options.onBanned || (() => {}),
            onWarning: options.onWarning || (() => {}),
            onError: options.onError || (() => {})
        };
        
        this.monitoring = false;
        this.interval = null;
        this.videoElement = null;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.lastCheck = 0;
        this.banKey = 'gengo_content_ban';
        
        // Load model when class is instantiated
        this.modelPromise = this.loadModel();
    }
    
    async loadModel() {
        try {
            console.log('Loading content moderation model...');
            this.model = await window.nsfwjs.load();
            console.log('Content moderation model loaded successfully');
            return true;
        } catch (error) {
            console.error('Failed to load content moderation model:', error);
            this.options.onError(new Error('Failed to load content moderation model'));
            return false;
        }
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
    
    async startMonitoring(videoElement) {
        if (this.monitoring || !videoElement) return;
        
        // Check if user is banned first
        if (await this.checkBanStatus()) return;
        
        // Wait for model to load if it hasn't already
        try {
            await this.modelPromise;
        } catch (error) {
            this.options.onError(error);
            return;
        }
        
        this.videoElement = videoElement;
        this.monitoring = true;
        
        // Start periodic checks
        this.interval = setInterval(() => this.checkContent(), this.options.checkInterval);
        console.log('Content monitoring started');
    }
    
    stopMonitoring() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.monitoring = false;
        console.log('Content monitoring stopped');
    }
    
    async checkContent() {
        if (!this.monitoring || !this.videoElement || !this.model) return;
        
        try {
            // Skip if video isn't ready
            if (this.videoElement.readyState < 2) return;
            
            // Resize canvas to match video dimensions
            const width = this.videoElement.videoWidth;
            const height = this.videoElement.videoHeight;
            
            if (!width || !height) return;
            
            this.canvas.width = width;
            this.canvas.height = height;
            
            // Capture frame from video
            this.ctx.drawImage(this.videoElement, 0, 0, width, height);
            
            // Classify the image
            const predictions = await this.model.classify(this.canvas);
            console.log('Content check result:', predictions);
            
            // Calculate explicit score (combining Porn and Sexy categories)
            const pornPrediction = predictions.find(p => p.className === 'Porn') || { probability: 0 };
            const sexyPrediction = predictions.find(p => p.className === 'Sexy') || { probability: 0 };
            
            const explicitScore = pornPrediction.probability * 1.0 + sexyPrediction.probability * 0.6;
            
            if (explicitScore >= this.options.banThreshold) {
                // Ban the user
                const ban = this.banUser();
                this.stopMonitoring();
                
                this.options.onBanned({
                    banned: true,
                    score: explicitScore,
                    pornScore: pornPrediction.probability,
                    sexyScore: sexyPrediction.probability,
                    message: 'Inappropriate content detected. Your account has been temporarily suspended.',
                    until: ban.until
                });
            } else if (explicitScore >= this.options.warningThreshold) {
                // Just issue a warning
                this.options.onWarning({
                    score: explicitScore,
                    pornScore: pornPrediction.probability,
                    sexyScore: sexyPrediction.probability,
                    message: 'Warning: Please ensure your content is appropriate for language learning.'
                });
            }
            
        } catch (error) {
            console.error('Error during content check:', error);
            this.options.onError(error);
        }
    }
}

// Make it globally available
window.ContentMonitor = ContentMonitor;