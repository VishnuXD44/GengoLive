export const configuration = {
    iceServers: [
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'stun:stun.l.google.com:19302'
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

export async function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection State:', peerConnection.connectionState);
        };

        peerConnection.onsignalingstatechange = () => {
            console.log('Signaling State:', peerConnection.signalingState);
        };

        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                remoteStream = event.streams[0];
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo && !remoteVideo.srcObject) {
                    remoteVideo.srcObject = remoteStream;
                }
            }
        };

        return peerConnection;
    } catch (err) {
        console.error('Error creating peer connection:', err);
        throw err;
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
        console.error('Error adding ICE candidate:', err);
        throw err;
    }
}

export function cleanup() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => {
            track.stop();
        });
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    localStream = null;
    remoteStream = null;
}
