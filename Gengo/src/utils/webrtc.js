export const configuration = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302'
            ]
        },
        {
            // Using Google's STUN servers as primary, and keeping openrelay as backup
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan'
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;

export async function startLocalStream(constraints = {
    video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { max: 30 }
    },
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    }
}) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
        }
        return localStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        throw err;
    }
}

export async function createPeerConnection(config = configuration) {
    try {
        const pc = new RTCPeerConnection(config);
        
        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState);
            switch(pc.connectionState) {
                case 'connected':
                    console.log('Connection established');
                    break;
                case 'disconnected':
                case 'failed':
                    console.log('Connection lost, attempting reconnection');
                    pc.restartIce();
                    break;
                case 'closed':
                    cleanup();
                    break;
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                pc.restartIce();
            }
        };

        return pc;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw new Error('Failed to create peer connection');
    }
}

export async function handleOffer(offer) {
    if (!peerConnection) {
        throw new Error('PeerConnection not initialized');
    }
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        return answer;
    } catch (err) {
        console.error('Error handling offer:', err);
        throw err;
    }
}

export async function createOffer() {
    if (!peerConnection) {
        throw new Error('PeerConnection not initialized');
    }

    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        return offer;
    } catch (err) {
        console.error('Error creating offer:', err);
        throw err;
    }
}

export async function handleAnswer(answer) {
    if (!peerConnection) {
        throw new Error('PeerConnection not initialized');
    }

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
        throw err;
    }
}

export async function handleIceCandidate(candidate) {
    if (!peerConnection) {
        throw new Error('PeerConnection not initialized');
    }

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        // Only log the error if it's not related to an invalid state
        // (which can happen during normal connection teardown)
        if (err.name !== 'InvalidStateError') {
            console.error('Error adding ICE candidate:', err);
            throw err;
        }
    }
}

export function cleanup() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
}
