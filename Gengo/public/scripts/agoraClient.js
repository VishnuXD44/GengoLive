import AgoraRTC from 'agora-rtc-sdk-ng';
// public/scripts/agoraClient.js
class AgoraClient {
    constructor() {
        this.client = null;
        this.localTracks = null;
        this.remoteStreams = {};
        this.hasPermissions = false;
    }

    async checkPermissions() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            stream.getTracks().forEach(track => track.stop());
            this.hasPermissions = true;
            return true;
        } catch (error) {
            console.error('Permission check failed:', error);
            this.hasPermissions = false;
            throw new Error(error.name === 'NotAllowedError' 
                ? 'Please allow camera and microphone access to use video chat'
                : 'Could not access media devices');
        }
    }

    async connectToRoom(appId, token, channelName, localVideoElement, remoteVideoElement, uid) {
        try {
            // Show loading state
            document.getElementById('loadingIndicator').classList.remove('hidden');
            
            // Check permissions first if not already granted
            if (!this.hasPermissions) {
                await this.checkPermissions();
            }

            // Show video container and controls
            document.querySelector('.video-container').style.display = 'grid';
            document.querySelector('.video-controls').style.display = 'flex';
            
            // Initialize the client
            this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
            
            // Create local audio and video tracks
            const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
            
            this.localTracks = {
                audioTrack: microphoneTrack,
                videoTrack: cameraTrack
            };
            
            // Play local video track
            this.localTracks.videoTrack.play(localVideoElement.id);
            
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
            
            // Join the channel and publish local tracks
            // The key part - using the token and uid correctly
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
            const statusElement = document.createElement('div');
            statusElement.className = `message ${type}-message`;
            statusElement.textContent = message;
            document.body.appendChild(statusElement);

            setTimeout(() => {
                statusElement.remove();
            }, 3000);
        }
    }

    cleanup() {
        try {
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
}

// Make it available globally
window.AgoraClient = AgoraClient;