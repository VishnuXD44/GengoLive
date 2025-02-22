// Previous code remains the same until the connectToRoom method
class TwilioVideoClient {
    constructor() {
        this.room = null;
        this.localTracks = null;
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

    async connectToRoom(token, roomName, localVideoElement, remoteVideoElement) {
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
            
            // Create local tracks with specific quality settings
            this.localTracks = await Twilio.Video.createLocalTracks({
                audio: {
                    noiseSuppression: true,
                    echoCancellation: true
                },
                video: {
                    width: 1280,
                    height: 720,
                    frameRate: 24,
                    facingMode: 'user'
                }
            });

            // Connect to room with updated settings (removed deprecated maxTracks)
            this.room = await Twilio.Video.connect(token, {
                name: roomName,
                tracks: this.localTracks,
                dominantSpeaker: true,
                maxAudioBitrate: 16000,
                preferredVideoCodecs: [{ codec: 'VP8', simulcast: true }],
                networkQuality: {
                    local: 2,
                    remote: 2
                },
                bandwidthProfile: {
                    video: {
                        mode: 'collaboration',
                        clientTrackSwitchOffControl: 'auto',
                        contentPreferencesMode: 'auto'
                    }
                }
            });

            // Rest of the code remains the same
            this.handleLocalParticipant(this.room.localParticipant, localVideoElement);
            this.room.participants.forEach(participant => {
                this.handleRemoteParticipant(participant, remoteVideoElement);
            });
            this.setupRoomEventListeners(remoteVideoElement);
            document.getElementById('loadingIndicator').classList.add('hidden');
            return this.room;

        } catch (error) {
            console.error('Error connecting to Twilio room:', error);
            if (this.localTracks) {
                this.localTracks.forEach(track => track.stop());
                this.localTracks = null;
            }
            document.querySelector('.video-container').style.display = 'none';
            document.querySelector('.video-controls').style.display = 'none';
            document.getElementById('loadingIndicator').classList.add('hidden');
            throw error;
        }
    }

    // Rest of the class implementation remains the same
    setupRoomEventListeners(remoteVideoElement) {
        if (!this.room) return;

        this.room.on('participantConnected', participant => {
            console.log(`Participant ${participant.identity} connected`);
            this.handleRemoteParticipant(participant, remoteVideoElement);
        });

        this.room.on('participantDisconnected', participant => {
            console.log(`Participant ${participant.identity} disconnected`);
            if (remoteVideoElement) {
                remoteVideoElement.innerHTML = '';
            }
        });

        this.room.on('disconnected', (room, error) => {
            if (error) {
                console.error('Room disconnected with error:', error);
            }
            this.cleanup();
        });

        this.room.on('reconnecting', error => {
            console.warn('Reconnecting to room:', error);
            this.showConnectionStatus('Reconnecting...');
        });

        this.room.on('reconnected', () => {
            console.log('Reconnected to room');
            this.showConnectionStatus('Connected', 'success');
        });

        this.room.on('networkQualityLevelChanged', (networkQuality) => {
            this.updateNetworkQualityIndicator(networkQuality.level);
        });
    }

    handleLocalParticipant(participant, container) {
        if (!container) return;
        
        participant.tracks.forEach(publication => {
            if (publication.track) {
                this.attachTrack(publication.track, container);
            }
        });

        participant.on('trackPublished', publication => {
            if (publication.track) {
                this.attachTrack(publication.track, container);
            }
        });

        participant.on('trackUnpublished', publication => {
            if (publication.track) {
                this.detachTrack(publication.track);
            }
        });
    }

    handleRemoteParticipant(participant, container) {
        if (!container) return;

        participant.tracks.forEach(publication => {
            if (publication.isSubscribed) {
                this.attachTrack(publication.track, container);
            }
        });

        participant.on('trackSubscribed', track => {
            this.attachTrack(track, container);
        });

        participant.on('trackUnsubscribed', track => {
            this.detachTrack(track);
        });
    }

    attachTrack(track, container) {
        const element = track.attach();
        container.appendChild(element);
    }

    detachTrack(track) {
        track.detach().forEach(element => element.remove());
    }

    toggleAudio() {
        if (!this.localTracks) return false;

        const audioTrack = this.localTracks.find(track => track.kind === 'audio');
        if (!audioTrack) return false;

        try {
            if (audioTrack.isEnabled) {
                audioTrack.disable();
                this.updateButton('muteAudio', true);
            } else {
                audioTrack.enable();
                this.updateButton('muteAudio', false);
            }
            return true;
        } catch (error) {
            console.error('Error toggling audio:', error);
            return false;
        }
    }

    toggleVideo() {
        if (!this.localTracks) return false;

        const videoTrack = this.localTracks.find(track => track.kind === 'video');
        if (!videoTrack) return false;

        try {
            if (videoTrack.isEnabled) {
                videoTrack.disable();
                this.updateButton('hideVideo', true);
            } else {
                videoTrack.enable();
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
        const statusElement = document.createElement('div');
        statusElement.className = `message ${type}-message`;
        statusElement.textContent = message;
        document.body.appendChild(statusElement);

        setTimeout(() => {
            statusElement.remove();
        }, 3000);
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

        const indicator = document.querySelector('.quality-indicator') || document.createElement('div');
        indicator.className = `quality-indicator ${quality.class}`;
        indicator.textContent = quality.text;

        if (!indicator.parentElement) {
            document.querySelector('.video-container').appendChild(indicator);
        }
    }

    cleanup() {
        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }
        if (this.localTracks) {
            this.localTracks.forEach(track => track.stop());
            this.localTracks = null;
        }
        document.querySelector('.video-container').style.display = 'none';
        document.querySelector('.video-controls').style.display = 'none';
        document.querySelector('.selection-container').style.display = 'flex';
    }

    disconnect() {
        this.cleanup();
        this.showConnectionStatus('Disconnected', 'info');
    }
}

window.TwilioVideoClient = TwilioVideoClient;
