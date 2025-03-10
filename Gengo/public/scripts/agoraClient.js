// public/scripts/agoraClient.js
class AgoraClient {
    constructor() {
        this.client = null;
        this.localStream = null;
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
            
            // Initialize the client
            this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
            
            // Initialize the client with your App ID
            await this.client.init(appId);
            
            // Create the local stream
            this.localStream = AgoraRTC.createStream({
                streamID: Math.floor(Math.random() * 100000),
                audio: true,
                video: true,
                screen: false
            });
            
            // Initialize the local stream
            await this.localStream.init();
            
            // Play local stream
            this.localStream.play(localVideoElement.id);

            // Register event listeners
            this.client.on('stream-added', evt => {
                // Subscribe to the stream
                this.client.subscribe(evt.stream, { video: true, audio: true });
                console.log('Stream added, subscribing: ', evt.stream.getId());
            });

            this.client.on('stream-subscribed', evt => {
                const remoteStream = evt.stream;
                console.log('Successfully subscribed to: ', remoteStream.getId());
                // Play the remote stream
                remoteStream.play(remoteVideoElement.id);
                this.remoteStreams[remoteStream.getId()] = remoteStream;
                
                // Show quality indicator
                this.updateNetworkQualityIndicator(3); // Default to 'Fair'
            });

            this.client.on('stream-removed', evt => {
                const remoteStream = evt.stream;
                if (remoteStream) {
                    remoteStream.stop();
                    delete this.remoteStreams[remoteStream.getId()];
                    console.log('Remote stream removed: ', remoteStream.getId());
                }
            });
            
            this.client.on('peer-leave', evt => {
                console.log('Peer left: ', evt.uid);
                // If we have this user's stream, remove it
                const streams = Object.values(this.remoteStreams);
                for (let stream of streams) {
                    if (stream.getId() === evt.uid) {
                        stream.stop();
                        delete this.remoteStreams[stream.getId()];
                        // Show message that peer left
                        this.showConnectionStatus('Your partner has left the call', 'warning');
                        break;
                    }
                }
            });

            // Join the channel
            await this.client.join(null, channelName, null);
            console.log('Successfully joined channel: ', channelName);
            
            // Publish the local stream
            await this.client.publish(this.localStream);
            console.log('Successfully published local stream');
            
            // Hide loading indicator
            document.getElementById('loadingIndicator').classList.add('hidden');
            
            return { channelName };
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
        if (!this.localStream) return false;

        try {
            if (this.localStream.isAudioOn()) {
                this.localStream.muteAudio();
                this.updateButton('muteAudio', true);
            } else {
                this.localStream.unmuteAudio();
                this.updateButton('muteAudio', false);
            }
            return true;
        } catch (error) {
            console.error('Error toggling audio:', error);
            return false;
        }
    }

    toggleVideo() {
        if (!this.localStream) return false;

        try {
            if (this.localStream.isVideoOn()) {
                this.localStream.muteVideo();
                this.updateButton('hideVideo', true);
            } else {
                this.localStream.unmuteVideo();
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
            if (this.localStream) {
                this.localStream.stop();
                this.localStream.close();
                this.localStream = null;
            }
            
            if (this.client) {
                this.client.leave(() => {
                    console.log('Client left channel successfully');
                }, err => {
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