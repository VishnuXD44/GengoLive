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

    async connectToRoom(appId, channelName, localVideoElement, remoteVideoElement) {
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
            
            // Initialize the client - UPDATED FOR AGORA v4.x
            this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
            
            // Create local audio and video tracks - UPDATED FOR AGORA v4.x
            const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
            
            // Store tracks in the local stream object for easier handling
            this.localTracks = {
                audioTrack: microphoneTrack,
                videoTrack: cameraTrack
            };
            
            // Play local video track
            this.localTracks.videoTrack.play(localVideoElement.id);
            
            // Register event listeners for remote users
            this.client.on('user-published', async (user, mediaType) => {
                // Subscribe to the remote user
                await this.client.subscribe(user, mediaType);
                
                console.log('Subscribe success, uid: ' + user.uid);
                
                // If it's video, play it
                if (mediaType === 'video') {
                    user.videoTrack.play(remoteVideoElement.id);
                }
                
                // If it's audio, play it
                if (mediaType === 'audio') {
                    user.audioTrack.play();
                }
                
                // Show quality indicator
                this.updateNetworkQualityIndicator(3); // Default to 'Fair'
            });
            
            this.client.on('user-unpublished', (user, mediaType) => {
                console.log('User unpublished: ', user.uid, mediaType);
                // Handle the unpublished stream
                if (mediaType === 'video') {
                    // Stop displaying the user's video
                }
            });
            
            this.client.on('user-left', (user) => {
                console.log('User left: ', user.uid);
                // Show message that peer left
                this.showConnectionStatus('Your partner has left the call', 'warning');
            });
            
            // Join the channel and publish local tracks
            const uid = await this.client.join(appId, channelName, null, null);
            console.log('Successfully joined channel: ', channelName, 'with UID:', uid);
            
            // Publish the local tracks
            await this.client.publish([this.localTracks.audioTrack, this.localTracks.videoTrack]);
            console.log('Successfully published local tracks');
            
            // Hide loading indicator
            document.getElementById('loadingIndicator').classList.add('hidden');
            
            return { channelName, uid };
        } catch (error) {
            console.error('Error connecting to Agora channel:', error);
            // Cleanup on error
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