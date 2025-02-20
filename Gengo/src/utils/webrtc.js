export const configuration = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ]
        },
        {
            urls: [
                'turn:openrelay.metered.ca:443',
                'turn:openrelay.metered.ca:443?transport=tcp',
                'turn:openrelay.metered.ca:80',
                'turn:openrelay.metered.ca:80?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 1, // Reduce pool size to speed up gathering
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan',
    iceTransportPolicy: 'all',
    // Add advanced options for better connection handling
    iceServersPolicy: 'all',
    // Prioritize connection establishment
    iceTransportOptions: {
        role: 'controlled',
        iceRestart: true
    },
    // Enable trickle ICE
    gatherPolicy: 'all',
    // Reduce connection timeouts
    iceCheckMinInterval: 50, // ms
    iceTrickleDelay: 0 // ms
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;

export async function startLocalStream(constraints = {
    video: {
        width: { min: 320, ideal: 640, max: 1280 },
        height: { min: 240, ideal: 480, max: 720 },
        frameRate: { min: 15, ideal: 24, max: 30 },
        aspectRatio: { ideal: 1.7777777778 },
        facingMode: 'user'
    },
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 2 },
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 16 }
    }
}) {
    try {
        // First try with ideal constraints
        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            console.warn('Failed to get media with ideal constraints, falling back to basic constraints:', error);
            
            // Fall back to basic constraints if ideal fails
            const basicConstraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { max: 24 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            };
            
            localStream = await navigator.mediaDevices.getUserMedia(basicConstraints);
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.playsInline = true;
            
            // Ensure video plays
            try {
                await localVideo.play();
                console.log('Local video playback started');
            } catch (playError) {
                console.warn('Auto-play failed:', playError);
            }
        }

        // Log stream information
        console.log('Local stream tracks:', localStream.getTracks().map(track => ({
            kind: track.kind,
            label: track.label,
            settings: track.getSettings()
        })));

        return localStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        if (err.name === 'NotAllowedError') {
            throw new Error('Camera/microphone access denied. Please grant permission to use your media devices.');
        } else if (err.name === 'NotFoundError') {
            throw new Error('No camera/microphone found. Please ensure your devices are properly connected.');
        } else if (err.name === 'NotReadableError') {
            throw new Error('Could not access your media devices. Please ensure they are not being used by another application.');
        }
        throw err;
    }
}

export async function createPeerConnection(config = configuration) {
    try {
        const pc = new RTCPeerConnection(config);
        
        // Monitor connection state changes
        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState);
            switch(pc.connectionState) {
                case 'new':
                    console.log('Connection created');
                    break;
                case 'connecting':
                    console.log('Connection establishing...');
                    break;
                case 'connected':
                    console.log('Connection established successfully');
                    break;
                case 'disconnected':
                    console.warn('Connection lost temporarily, attempting recovery');
                    // Try to recover the connection
                    setTimeout(() => {
                        if (pc.connectionState === 'disconnected') {
                            console.log('Attempting ICE restart...');
                            pc.restartIce();
                        }
                    }, 2000);
                    break;
                case 'failed':
                    console.error('Connection failed permanently');
                    cleanup();
                    break;
                case 'closed':
                    console.log('Connection closed');
                    cleanup();
                    break;
            }
        };

        // Monitor ICE connection state
        pc.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.iceConnectionState);
            console.log('ICE Gathering State:', pc.iceGatheringState);
            
            if (pc.iceConnectionState === 'failed') {
                console.warn('ICE connection failed, attempting restart');
                pc.restartIce();
            } else if (pc.iceConnectionState === 'disconnected') {
                console.warn('ICE connection disconnected, waiting for recovery');
            }
        };

        // Monitor ICE gathering state
        pc.onicegatheringstatechange = () => {
            console.log('ICE Gathering State:', pc.iceGatheringState);
        };

        // Monitor ICE candidate errors
        pc.onicecandidateerror = (event) => {
            console.warn('ICE Candidate Error:', event.errorCode, event.errorText);
        };

        // Monitor signaling state
        pc.onsignalingstatechange = () => {
            console.log('Signaling State:', pc.signalingState);
        };

        // Monitor negotiation needed
        pc.onnegotiationneeded = () => {
            console.log('Negotiation needed');
        };

        return pc;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw new Error(`Failed to create peer connection: ${error.message}`);
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
