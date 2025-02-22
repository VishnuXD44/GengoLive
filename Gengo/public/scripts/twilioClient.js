class TwilioVideoClient {
    constructor() {
        this.room = null;
        this.localTracks = null;
    }

    async connectToRoom(token, roomName, localVideoElement, remoteVideoElement) {
        try {
            // Request permissions first
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            stream.getTracks().forEach(track => track.stop()); // Stop tracks after permission check

            // Create local tracks
            this.localTracks = await Twilio.Video.createLocalTracks({
                audio: true,
                video: {
                    width: 640,
                    height: 480,
                    frameRate: 24
                }
            }).catch(error => {
                if (error.name === 'NotAllowedError') {
                    throw new Error('Camera and microphone permissions are required');
                }
                throw error;
            });

            // Connect to room
            this.room = await Twilio.Video.connect(token, {
                name: roomName,
                tracks: this.localTracks,
                dominantSpeaker: true,
                maxAudioBitrate: 16000,
                preferredVideoCodecs: ['VP8', 'H264'],
                networkQuality: {
                    local: 1,
                    remote: 1
                }
            });

            // Handle local participant
            this.handleLocalParticipant(this.room.localParticipant, localVideoElement);

            // Handle connected participants
            this.room.participants.forEach(participant => {
                this.handleRemoteParticipant(participant, remoteVideoElement);
            });

            // Handle participant connected event
            this.room.on('participantConnected', participant => {
                this.handleRemoteParticipant(participant, remoteVideoElement);
            });

            // Handle disconnection
            this.room.on('disconnected', room => {
                room.localParticipant.tracks.forEach(publication => {
                    publication.track.stop();
                });
            });

            // Handle errors
            this.room.on('reconnecting', error => {
                console.warn('Reconnecting to room:', error);
            });

            this.room.on('reconnected', () => {
                console.log('Reconnected to room');
            });

            return this.room;
        } catch (error) {
            console.error('Error connecting to Twilio room:', error);
            if (this.localTracks) {
                this.localTracks.forEach(track => track.stop());
                this.localTracks = null;
            }
            throw error;
        }
    }

    handleLocalParticipant(participant, container) {
        participant.tracks.forEach(publication => {
            if (publication.track) {
                this.attachTrack(publication.track, container);
            }
        });
    }

    handleRemoteParticipant(participant, container) {
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
        if (!this.localTracks) {
            console.warn('No local tracks available');
            return false;
        }

        const audioTrack = this.localTracks.find(track => track.kind === 'audio');
        if (!audioTrack) {
            console.warn('No audio track found');
            return false;
        }

        try {
            if (audioTrack.isEnabled) {
                audioTrack.disable();
                // Update UI
                const muteButton = document.getElementById('muteAudio');
                if (muteButton) {
                    muteButton.classList.add('muted');
                    muteButton.querySelector('span').textContent = 'Unmute Audio';
                }
            } else {
                audioTrack.enable();
                // Update UI
                const muteButton = document.getElementById('muteAudio');
                if (muteButton) {
                    muteButton.classList.remove('muted');
                    muteButton.querySelector('span').textContent = 'Mute Audio';
                }
            }
            return true;
        } catch (error) {
            console.error('Error toggling audio:', error);
            return false;
        }
    }

    toggleVideo() {
        if (!this.localTracks) {
            console.warn('No local tracks available');
            return false;
        }

        const videoTrack = this.localTracks.find(track => track.kind === 'video');
        if (!videoTrack) {
            console.warn('No video track found');
            return false;
        }

        try {
            if (videoTrack.isEnabled) {
                videoTrack.disable();
                // Update UI
                const hideVideoButton = document.getElementById('hideVideo');
                if (hideVideoButton) {
                    hideVideoButton.classList.add('video-off');
                    hideVideoButton.querySelector('span').textContent = 'Show Video';
                }
            } else {
                videoTrack.enable();
                // Update UI
                const hideVideoButton = document.getElementById('hideVideo');
                if (hideVideoButton) {
                    hideVideoButton.classList.remove('video-off');
                    hideVideoButton.querySelector('span').textContent = 'Hide Video';
                }
            }
            return true;
        } catch (error) {
            console.error('Error toggling video:', error);
            return false;
        }
    }

    disconnect() {
        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }
        if (this.localTracks) {
            this.localTracks.forEach(track => track.stop());
            this.localTracks = null;
        }
    }
}

window.TwilioVideoClient = TwilioVideoClient;
