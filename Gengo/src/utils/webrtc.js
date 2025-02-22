// Configuration will be fetched from server
export const configuration = {
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan',
    iceTransportPolicy: 'all'
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
        
        pc._iceCandidates = [];
        let connectionAttempts = 0;
        const MAX_ATTEMPTS = 3;
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE candidate:', event.candidate.candidate);
            }
        };

        // Handle incoming tracks
        pc.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            if (!event.streams || event.streams.length === 0) {
                console.warn('No streams in track event');
                return;
            }

            const stream = event.streams[0];
            console.log('Remote stream ID:', stream.id);
            console.log('Remote stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`));

            // Enable tracks immediately
            event.track.enabled = true;

            // Store the remote stream
            remoteStream = stream;

            // Handle track ended
            event.track.onended = () => {
                console.log(`Remote ${event.track.kind} track ended`);
            };

            // Handle track muted/unmuted
            event.track.onmute = () => {
                console.log(`Remote ${event.track.kind} track muted`);
            };
            event.track.onunmute = () => {
                console.log(`Remote ${event.track.kind} track unmuted`);
            };

            // Dispatch custom event for stream handling
            pc.dispatchEvent(new CustomEvent('remoteStream', { detail: stream }));
        };

        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') {
                clearTimeout(pc._gatheringTimeout);
            }
        };

        pc._gatheringTimeout = setTimeout(() => {
            if (pc.iceGatheringState !== 'complete') {
                console.warn('ICE gathering incomplete, continuing anyway');
            }
        }, 8000);

        // Enhanced connection monitoring
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
                    if (connectionAttempts < MAX_ATTEMPTS) {
                        connectionAttempts++;
                        console.log(`Connection attempt ${connectionAttempts}/${MAX_ATTEMPTS}`);
                        handleDisconnection(pc);
                    }
                    break;
                case 'failed':
                    if (connectionAttempts < MAX_ATTEMPTS) {
                        connectionAttempts++;
                        // Try TCP-only on failure
                        pc.setConfiguration({
                            ...config,
                            iceTransportPolicy: 'relay',
                            iceServers: config.iceServers.map(server => ({
                                ...server,
                                urls: Array.isArray(server.urls) ? 
                                    server.urls.filter(url => url.includes('tcp')) : 
                                    server.urls
                            }))
                        });
                        pc.restartIce();
                    } else {
                        handleConnectionFailure(pc);
                    }
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
