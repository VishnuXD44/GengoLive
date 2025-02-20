// Updated WebRTC configuration for better connection handling
export const configuration = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                // Added more STUN servers for redundancy
                'stun:stun.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ]
        },
        {
            // Updated TURN configuration with both TCP and UDP
            urls: [
                'turn:openrelay.metered.ca:443?transport=tcp',
                'turn:openrelay.metered.ca:443?transport=udp',
                'turn:openrelay.metered.ca:80?transport=tcp',
                'turn:openrelay.metered.ca:80?transport=udp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10, // Increased from 1 to 10
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan',
    iceTransportPolicy: 'all',
    // Updated connection options
    iceServersPolicy: 'all',
    gatherPolicy: 'all',
    iceCheckMinInterval: 50, // Reduced from 100
    iceTrickleDelay: 50 // Added delay for trickle ICE
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;

export async function startLocalStream(constraints = {
    video: {
        width: { min: 320, ideal: 640, max: 1280 },
        height: { min: 240, ideal: 480, max: 720 },
        frameRate: { min: 15, ideal: 24, max: 30 },
        aspectRatio: { ideal: 1.7777777778 }
    },
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleSize: 16
    }
}) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const localVideo = document.getElementById('localVideo');
        
        if (localVideo) {
            // Clean up existing stream
            if (localVideo.srcObject) {
                const tracks = localVideo.srcObject.getTracks();
                tracks.forEach(track => track.stop());
                localVideo.srcObject = null;
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Set up new stream
            localVideo.srcObject = stream;
            localVideo.muted = true;
            localVideo.playsInline = true;

            // Wait for metadata with timeout
            await Promise.race([
                new Promise((resolve) => {
                    localVideo.onloadedmetadata = () => {
                        console.log('Local video metadata loaded successfully');
                        resolve();
                    };
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Metadata loading timeout')), 10000)
                )
            ]);

            // Ensure video plays with retry
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await localVideo.play();
                    console.log('Local video playback started successfully');
                    break;
                } catch (error) {
                    console.warn(`Play attempt ${attempt} failed:`, error);
                    if (attempt === 3) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Monitor track states
            stream.getTracks().forEach(track => {
                track.onended = () => console.log(`Local ${track.kind} track ended`);
                track.onmute = () => console.log(`Local ${track.kind} track muted`);
                track.onunmute = () => console.log(`Local ${track.kind} track unmuted`);
            });
        }

        return stream;
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            throw new Error('Camera/microphone access denied. Please grant permission to use your media devices.');
        } else if (err.name === 'NotFoundError') {
            throw new Error('No camera/microphone found. Please ensure your devices are properly connected.');
        } else if (err.name === 'NotReadableError') {
            throw new Error('Could not access your media devices. Please ensure they are not being used by another application.');
        } else if (err.name === 'OverconstrainedError') {
            console.warn('Falling back to basic constraints');
            return startLocalStream({
                video: true,
                audio: true
            });
        }
        throw err;
    }
}

export async function createPeerConnection(config = configuration) {
    try {
        const pc = new RTCPeerConnection(config);
        
        // Add buffered candidates property
        pc._iceCandidates = [];
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE candidate:', event.candidate.candidate);
            }
        };

        // Add ice gathering timeout handler
        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') {
                clearTimeout(pc._gatheringTimeout);
            }
        };

        // Set gathering timeout
        pc._gatheringTimeout = setTimeout(() => {
            if (pc.iceGatheringState !== 'complete') {
                console.warn('ICE gathering incomplete, continuing anyway');
            }
        }, 8000);

        // Add connection monitoring
        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState);
            switch(pc.connectionState) {
                case 'connecting':
                    startConnectionTimeout(pc);
                    break;
                case 'connected':
                    clearConnectionTimeout(pc);
                    break;
                case 'disconnected':
                    handleDisconnection(pc);
                    break;
                case 'failed':
                    handleConnectionFailure(pc);
                    break;
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                pc.restartIce();
            }
        };

        pc.onicegatheringstatechange = () => {
            console.log('ICE Gathering State:', pc.iceGatheringState);
        };

        pc.onsignalingstatechange = () => {
            console.log('Signaling State:', pc.signalingState);
        };

        return pc;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw error;
    }
}

// Add these helper functions
function startConnectionTimeout(pc) {
    pc._connectionTimeout = setTimeout(() => {
        if (pc.connectionState === 'connecting') {
            console.warn('Connection timeout, attempting recovery');
            pc.restartIce();
        }
    }, 15000);
}

function clearConnectionTimeout(pc) {
    if (pc._connectionTimeout) {
        clearTimeout(pc._connectionTimeout);
        pc._connectionTimeout = null;
    }
}

function handleDisconnection(pc) {
    setTimeout(() => {
        if (pc.connectionState === 'disconnected') {
            pc.restartIce();
        }
    }, 2000);
}

function handleConnectionFailure(pc) {
    cleanup();
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
        if (err.name !== 'InvalidStateError') {
            console.error('Error adding ICE candidate:', err);
            throw err;
        }
    }
}

// Add this new function for handling ICE candidates
export async function handleIceCandidateError(pc, candidate) {
    try {
        if (pc.remoteDescription) {
            await pc.addIceCandidate(candidate);
        } else {
            // Buffer candidate if remote description isn't set
            pc._iceCandidates = pc._iceCandidates || [];
            pc._iceCandidates.push(candidate);
        }
    } catch (err) {
        console.warn('Error adding ICE candidate:', err);
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

export async function waitForIceGathering(pc) {
    try {
        await Promise.race([
            new Promise((resolve) => {
                if (pc.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    pc.onicegatheringstatechange = () => {
                        if (pc.iceGatheringState === 'complete') {
                            resolve();
                        }
                    };
                }
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('ICE gathering timeout')), 8000))
        ]);
    } catch (error) {
        console.warn('ICE gathering incomplete:', error);
    }
}
