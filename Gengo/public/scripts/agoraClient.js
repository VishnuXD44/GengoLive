// Remove the require statement
// const ContentMonitor = require('./contentMonitor.js');

// public/scripts/agoraClient.js
class AgoraClient {
    constructor() {
        this.client = null;
        this.localTracks = null;
        this.remoteStreams = {};
        this.hasPermissions = false;
        
        // Store connection parameters for potential reconnection
        this.appId = null;
        this.token = null;
        this.channelName = null;
        this.uid = null;
        
        // Try to initialize content monitor
        try {
            // Use the global ContentMonitor class
            this.contentMonitor = new window.ContentMonitor({
                checkInterval: 2000, // Check every 2 seconds
                warningThreshold: 0.5, // Lower threshold
                banThreshold: 0.7, // Lower threshold
                consecutiveThreshold: 2, // Only need 2 consecutive detections
                onBanned: (result) => this.handleContentBan(result),
                onWarning: (result) => this.handleContentWarning(result),
                onError: (error) => console.error('Content monitor error:', error)
            });
            console.log('Content monitoring initialized');
        } catch (e) {
            console.error('Failed to initialize content monitoring:', e);
            // Create a dummy content monitor with the same API
            this.contentMonitor = {
                checkBanStatus: () => Promise.resolve(false),
                startMonitoring: () => {},
                stopMonitoring: () => {}
            };
        }
        
        // Log domain information
        console.log('Agora client initialized on:', {
            domain: window.location.hostname,
            protocol: window.location.protocol,
            secure: window.isSecureContext
        });
    }

    async checkPermissions() {
        try {
            // Check if we're in a secure context (HTTPS)
            if (!window.isSecureContext) {
                console.warn('Not in a secure context. Video/audio permissions may be denied.');
                this.showConnectionStatus('Please use HTTPS for video/audio access', 'warning');
                
                // Redirect to HTTPS www.gengo.live if needed
                if (window.location.protocol === 'http:' || window.location.hostname === 'gengo.live') {
                    const httpsUrl = 'https://www.gengo.live' + window.location.pathname + window.location.search;
                    console.log('Redirecting to secure connection:', httpsUrl);
                    this.showConnectionStatus('Redirecting to secure connection...', 'warning');
                    window.location.href = httpsUrl;
                    return false;
                }
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            stream.getTracks().forEach(track => track.stop());
            this.hasPermissions = true;
            return true;
        } catch (error) {
            console.error('Permission check failed:', error);
            this.hasPermissions = false;
            throw new Error(error.name === 'NotAllowedError' 
                ? 'Please allow camera and microphone access to use video chat'
                : `Could not access media devices: ${error.message || error.name}`);
        }
    }

    async connectToRoom(appId, token, channelName, localVideoElement, remoteVideoElement, uid) {
        try {
            // Store these for potential reconnection
            this.appId = appId;
            this.token = token;
            this.channelName = channelName;
            this.uid = uid;
            
            // First check if user is banned
            const isBanned = await this.contentMonitor.checkBanStatus();
            if (isBanned) {
                throw new Error('Your account is temporarily suspended due to a content violation.');
            }
            
            // Show loading state
            document.getElementById('loadingIndicator').classList.remove('hidden');
            
            // Check permissions first if not already granted
            if (!this.hasPermissions) {
                await this.checkPermissions();
            }

            // Show video container and controls
            document.querySelector('.video-container').style.display = 'grid';
            document.querySelector('.video-controls').style.display = 'flex';
            
            // Initialize the client (no cloud proxy)
            this.client = AgoraRTC.createClient({ 
                mode: 'rtc', 
                codec: 'vp8'
            });
            
            // Add network quality monitoring
            this.client.on('network-quality', (stats) => {
                // Update the UI with quality information
                this.updateNetworkQualityIndicator(
                    Math.min(stats.downlinkNetworkQuality, stats.uplinkNetworkQuality)
                );
            });
            
            // Create local audio and video tracks
            const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
            
            this.localTracks = {
                audioTrack: microphoneTrack,
                videoTrack: cameraTrack
            };
            
            // Play local video track
            this.localTracks.videoTrack.play(localVideoElement.id);
            
            // Start content monitoring on local video element
            this.contentMonitor.startMonitoring(localVideoElement);
            
            // Register event listeners
            this.client.on('user-published', async (user, mediaType) => {
                await this.client.subscribe(user, mediaType);
                
                console.log('Subscribe success, uid: ' + user.uid);
                
                if (mediaType === 'video') {
                    user.videoTrack.play(remoteVideoElement.id);
                }
                
                if (mediaType === 'audio') {
                    user.audioTrack.play();
                }
            });
            
            // Log connection information with domain
            console.log(`Connecting to Agora from ${window.location.hostname} with:`, {
                channelName,
                hasToken: !!token,
                tokenLength: token ? token.length : 0,
                uidProvided: !!uid
            });
            
            // Join the channel and publish local tracks
            const clientUid = await this.client.join(appId, channelName, token, uid || null);
            console.log('Successfully joined channel:', channelName, 'with UID:', clientUid);
            
            await this.client.publish([this.localTracks.audioTrack, this.localTracks.videoTrack]);
            console.log('Successfully published local tracks');
            
            // Hide loading indicator
            document.getElementById('loadingIndicator').classList.add('hidden');
            
            return { channelName, uid: clientUid };
        } catch (error) {
            console.error('Error connecting to Agora channel:', error);
            this.cleanup();
            document.getElementById('loadingIndicator').classList.add('hidden');
            throw error;
        }
    }

    updateNetworkQualityIndicator(level) {
        const quality = {
            0: { class: 'poor', text: 'Poor Connection' },
            1: { class: 'poor', text: 'Poor Connection' },
            2: { class: 'fair', text: 'Fair Connection' },
            3: { class: 'fair', text: 'Fair Connection' },
            4: { class: 'good', text: 'Good Connection' },
            5: { class: 'good', text: 'Excellent Connection' }
        }[level] || { class: 'unknown', text: 'Unknown Quality' };

        let indicator = document.querySelector('.quality-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = `quality-indicator ${quality.class}`;
            document.querySelector('.video-container').appendChild(indicator);
        } else {
            indicator.className = `quality-indicator ${quality.class}`;
        }
        
        indicator.textContent = quality.text;
    }

    toggleAudio() {
        if (!this.localTracks?.audioTrack) return false;

        try {
            if (this.localTracks.audioTrack.enabled) {
                this.localTracks.audioTrack.setEnabled(false);
                this.updateButton('muteAudio', true);
            } else {
                this.localTracks.audioTrack.setEnabled(true);
                this.updateButton('muteAudio', false);
            }
            return true;
        } catch (error) {
            console.error('Error toggling audio:', error);
            return false;
        }
    }

    toggleVideo() {
        if (!this.localTracks?.videoTrack) return false;

        try {
            if (this.localTracks.videoTrack.enabled) {
                this.localTracks.videoTrack.setEnabled(false);
                this.updateButton('hideVideo', true);
            } else {
                this.localTracks.videoTrack.setEnabled(true);
                this.updateButton('hideVideo', false);
            }
            return true;
        } catch (error) {
            console.error('Error toggling video:', error);
            return false;
        }
    }

    updateButton(buttonId, isOff) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        if (isOff) {
            button.classList.add(buttonId === 'muteAudio' ? 'muted' : 'video-off');
            button.querySelector('span').textContent = buttonId === 'muteAudio' ? 'Unmute Audio' : 'Show Video';
        } else {
            button.classList.remove(buttonId === 'muteAudio' ? 'muted' : 'video-off');
            button.querySelector('span').textContent = buttonId === 'muteAudio' ? 'Mute Audio' : 'Hide Video';
        }
    }

    showConnectionStatus(message, type = 'info') {
        // Create a global function for showing messages
        if (window.showMessage) {
            window.showMessage(message, type);
        } else {
            // Remove any existing messages of the same type
            const existingMessages = document.querySelectorAll(`.message.${type}-message`);
            existingMessages.forEach(msg => msg.remove());
            
            const statusElement = document.createElement('div');
            statusElement.className = `message ${type}-message`;
            
            // Main message text
            const messageText = document.createElement('span');
            messageText.textContent = message;
            statusElement.appendChild(messageText);
            
            // Add close button for all messages
            const closeButton = document.createElement('button');
            closeButton.textContent = '×';
            closeButton.className = 'message-close';
            closeButton.onclick = () => statusElement.remove();
            statusElement.appendChild(closeButton);
            
            document.body.appendChild(statusElement);

            // Auto-remove after delay (shorter for info/success, longer for warnings/errors)
            const timeout = type === 'error' ? 8000 : (type === 'warning' ? 5000 : 3000);
            setTimeout(() => {
                if (statusElement.parentElement) {
                    statusElement.remove();
                }
            }, timeout);
        }
    }

    cleanup() {
        try {
            // Stop content monitoring
            this.contentMonitor.stopMonitoring();
            
            // Clear saved session info
            this.appId = null;
            this.token = null;
            this.channelName = null;
            this.uid = null;
            
            // Close local tracks
            if (this.localTracks) {
                Object.values(this.localTracks).forEach(track => {
                    if (track) {
                        track.close();
                    }
                });
                this.localTracks = null;
            }
            
            // Leave the channel
            if (this.client) {
                this.client.leave().then(() => {
                    console.log('Client left channel successfully');
                }).catch(err => {
                    console.error('Failed to leave channel:', err);
                });
                this.client = null;
            }
            
            document.querySelector('.video-container').style.display = 'none';
            document.querySelector('.video-controls').style.display = 'none';
            document.querySelector('.selection-container').style.display = 'flex';
            
            // Remove quality indicator
            const indicator = document.querySelector('.quality-indicator');
            if (indicator) {
                indicator.remove();
            }
            
        } catch (error) {
            console.error('Error cleaning up Agora resources:', error);
        }
    }

    disconnect() {
        this.cleanup();
        this.showConnectionStatus('Disconnected', 'info');
    }

    // Add this new method to your class
    async reconnect(attempts = 3) {
        if (!this.appId || !this.channelName || !this.token) {
            console.error('Cannot reconnect: Missing connection parameters');
            return false;
        }
        
        let attemptCount = 0;
        while (attemptCount < attempts) {
            attemptCount++;
            this.showConnectionStatus(`Reconnecting... Attempt ${attemptCount}/${attempts}`, 'warning');
            
            try {
                // Try to rejoin with same parameters
                await this.client.join(this.appId, this.channelName, this.token, this.uid);
                
                if (this.localTracks) {
                    await this.client.publish(Object.values(this.localTracks));
                }
                
                this.showConnectionStatus('Connection restored!', 'success');
                return true;
            } catch (error) {
                console.error(`Reconnection attempt ${attemptCount} failed:`, error);
                // Wait before next attempt
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        this.showConnectionStatus('Failed to reconnect after multiple attempts', 'error');
        return false;
    }

    // Add these new methods for content monitoring
    handleContentBan(result) {
        // Immediately disconnect
        this.disconnect();
        
        // Clear any existing ban messages
        document.querySelectorAll('.content-ban-message').forEach(el => el.remove());
        
        // Show ban message to user
        this.showConnectionStatus(`${result.message}`, 'error');
        
        // Calculate hours remaining in a more readable format
        const hoursRemaining = ((result.until - Date.now()) / 3600000).toFixed(1);
        
        // Show permanent ban message
        const banMessage = document.createElement('div');
        banMessage.className = 'content-ban-message';
        banMessage.innerHTML = `
            <div class="ban-header">Account Suspended</div>
            <div class="ban-reason">Inappropriate content detected in video feed.</div>
            <div class="ban-detail">Suspended for ${hoursRemaining} hours.</div>
            <button id="dismiss-ban">Dismiss</button>
        `;
        document.body.appendChild(banMessage);
        
        document.getElementById('dismiss-ban').addEventListener('click', () => {
            banMessage.remove();
        });
    }
    
    handleContentWarning(result) {
        this.showConnectionStatus(`${result.message}`, 'warning');
    }
}

// Make it available globally
window.AgoraClient = AgoraClient;