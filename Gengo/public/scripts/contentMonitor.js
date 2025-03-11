// Replace with this simplified version if you continue having issues

/**
 * Simplified content monitor that maintains the same API
 * but doesn't actually perform content detection
 */
class ContentMonitor {
    constructor(options = {}) {
        this.options = {
            checkInterval: options.checkInterval || 5000,
            warningThreshold: options.warningThreshold || 0.6,
            banThreshold: options.banThreshold || 0.8,
            banDuration: options.banDuration || 24,
            onBanned: options.onBanned || (() => {}),
            onWarning: options.onWarning || (() => {}),
            onError: options.onError || (() => {})
        };
        
        this.monitoring = false;
        this.interval = null;
        this.videoElement = null;
        this.banKey = 'gengo_content_ban';
        
        console.log('Content monitor initialized (simplified version)');
    }
    
    async loadModel() {
        // Simplified version doesn't actually load a model
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
    
    startMonitoring(videoElement) {
        if (this.monitoring || !videoElement) return;
        this.videoElement = videoElement;
        this.monitoring = true;
        console.log('Content monitoring started (simplified version)');
        return true;
    }
    
    stopMonitoring() {
        this.monitoring = false;
        console.log('Content monitoring stopped');
    }
    
    // This method would normally check content but is a no-op in this version
    async checkContent() {
        return true;
    }
}

// Make it globally available
window.ContentMonitor = ContentMonitor;