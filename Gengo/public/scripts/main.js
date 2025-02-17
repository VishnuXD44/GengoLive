// ============ GLOBAL VARIABLES AND CONFIGURATION ============
let localStream;
let remoteStream;
let peerConnection;
let socket;
let currentRoom;
let iceCandidatesQueue = [];

const configuration = {
    iceServers: [
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'relay',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// ============ WEBRTC CONNECTION FUNCTIONS ============
async function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    try {
        peerConnection = new RTCPeerConnection(configuration);

        // Add local tracks first
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log('Added local track:', track.kind);
            });
        }

        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                // Only set srcObject once when we get the first track
                if (!remoteVideo.srcObject) {
                    remoteVideo.srcObject = new MediaStream();
                }
                
                // Add track to the existing stream
                const stream = remoteVideo.srcObject;
                stream.addTrack(event.track);
                remoteStream = stream;

                // Set basic attributes
                remoteVideo.setAttribute('playsinline', '');
                remoteVideo.muted = true;

                // Only attempt playback when we have both tracks
                if (stream.getTracks().length === 2) {
                    console.log('Both tracks received, attempting playback');
                    
                    // Wait a moment for tracks to stabilize
                    setTimeout(() => {
                        const playVideo = () => {
                            remoteVideo.play()
                                .then(() => {
                                    console.log('Remote video playing successfully');
                                    remoteVideo.muted = false;
                                })
                                .catch(error => {
                                    console.warn('Remote video play failed:', error);
                                    // Retry on next animation frame
                                    requestAnimationFrame(playVideo);
                                });
                        };
                        playVideo();
                    }, 100);
                }
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && currentRoom) {
                console.log('Sending ICE candidate:', event.candidate.type);
                socket.emit('candidate', event.candidate, currentRoom);
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                console.log('ICE Failed - Restarting');
                peerConnection.restartIce();
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                console.log('Peer connection failed - Resetting');
                resetVideoCall();
            }
        };

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        showMessage('Error creating connection', 'error');
        throw error;
    }
}

// ============ SOCKET COMMUNICATION FUNCTIONS ============
function initializeSocket() {
    try {
        socket = io(window.location.origin, {
            path: '/socket.io/',
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            socket.emit('join', { language, role });
        });

        setupSocketListeners();
    } catch (error) {
        console.error('Socket initialization error:', error);
        showMessage('Failed to connect to server', 'error');
        resetVideoCall();
    }
}

function setupSocketListeners() {
    socket.on('match', async ({ offer, room }) => {
        console.log(`Matched in room: ${room}, initiating offer: ${offer}`);
        currentRoom = room;

        try {
            await createPeerConnection();
            
            if (offer) {
                const offerDescription = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offerDescription);
                socket.emit('offer', offerDescription, room);
                console.log('Sent offer');
            }
        } catch (error) {
            console.error('Error in match:', error);
            showMessage('Connection error', 'error');
        }
    });

    socket.on('offer', async (offer) => {
        try {
            if (!peerConnection) {
                await createPeerConnection();
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Process any queued candidates
            while (iceCandidatesQueue.length > 0) {
                const candidate = iceCandidatesQueue.shift();
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer, currentRoom);
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Error handling offer', 'error');
        }
    });

    socket.on('answer', async (answer) => {
        try {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Set remote description from answer');
            }
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Error handling answer', 'error');
        }
    });

    socket.on('candidate', async (candidate) => {
        try {
            if (peerConnection && peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added ICE candidate');
            } else {
                iceCandidatesQueue.push(candidate);
                console.log('Queued ICE candidate');
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    });

    socket.on('user-disconnected', () => {
        showMessage('Peer disconnected', 'info');
        resetVideoCall();
    });
}

// ============ CALL MANAGEMENT FUNCTIONS ============
async function checkMediaPermissions() {
    try {
        // Only check if the API exists
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Media devices not supported');
        }

        // Try to get permissions
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // Stop the test stream immediately
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('Permission check error:', error);
        showMessage('Camera and microphone access required', 'error');
        return false;
    }
}

async function startCall() {
    try {
        // First check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Media devices not supported');
        }

        // Try to get user media with more specific constraints for mobile
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: {
                facingMode: 'user',
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 }
            }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (mediaError) {
            console.warn('Failed with ideal constraints, trying basic setup:', mediaError);
            // Fallback to basic constraints
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.setAttribute('playsinline', '');
            
            // Wait for metadata before playing
            try {
                await new Promise((resolve) => {
                    if (localVideo.readyState >= 2) {
                        resolve();
                    } else {
                        localVideo.onloadedmetadata = () => resolve();
                    }
                });
                await localVideo.play();
            } catch (playError) {
                console.warn('Local video play failed, retrying:', playError);
                setTimeout(() => localVideo.play(), 1000);
            }
        }

        // Update UI first
        document.getElementById('connect').style.display = 'none';
        document.getElementById('leave').style.display = 'block';
        document.querySelector('.selection-container').style.display = 'none';
        document.querySelector('.video-container').style.display = 'grid';

        // Then initialize connection
        await initializeSocket();
    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Please ensure camera and microphone permissions are granted', 'error');
        resetVideoCall();
    }
}

function resetVideoCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (socket) {
        socket.disconnect();
    }

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    if (localVideo) {
        localVideo.srcObject = null;
    }
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }

    localStream = null;
    remoteStream = null;
    currentRoom = null;
    iceCandidatesQueue = [];

    document.querySelector('.video-container').style.display = 'none';
    document.querySelector('.selection-container').style.display = 'flex';
    document.getElementById('connect').style.display = 'block';
    document.getElementById('leave').style.display = 'none';
}

function leaveCall() {
    resetVideoCall();
    showMessage('Call ended', 'info');
}

// ============ UI FUNCTIONS ============
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 5000);
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    
    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            const hasPermissions = await checkMediaPermissions();
            if (hasPermissions) {
                startCall();
            }
        });
    }
    
    if (leaveButton) {
        leaveButton.addEventListener('click', leaveCall);
        leaveButton.style.display = 'none';
    }
});