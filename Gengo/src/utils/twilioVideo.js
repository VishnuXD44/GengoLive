const Video = require('twilio-video');

class TwilioVideoService {
    constructor() {
        this.room = null;
        this.localTrack = null;
    }

    async connectToRoom(token, roomName, localVideoElement, remoteVideoElement) {
        try {
            // Create local tracks
            const localTracks = await Video.createLocalTracks({
                audio: true,
                video: { width: 640, height: 480 }
            });

            // Connect to room
            this.room = await Video.connect(token, {
                name: roomName,
                tracks: localTracks,
                dominantSpeaker: true,
                maxAudioBitrate: 16000,
                preferredVideoCodecs: ['VP8', 'H264']
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

            return this.room;
        } catch (error) {
            console.error('Error connecting to Twilio room:', error);
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

    disconnect() {
        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }
    }
}

module.exports = TwilioVideoService;
