// ============ GLOBAL VARIABLES AND CONFIGURATION ============
let localStream;
let remoteStream;
let peerConnection;
let socket;
let currentRoom;
let iceCandidatesQueue = [];

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun1.l.google.com:19302' },
        { urls: 'stun2.l.google.com:19302' },
        { urls: 'stun3.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// ============ MEDIA HANDLING FUNCTIONS ============
async function checkMediaPermissions() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Media devices not supported');
        }
        return true;
    } catch (error) {
        console.error('Permission check error:', error);
        showMessage('Camera and microphone access required', 'error');
        return false;
    }
}

// ============ WEBRTC CONNECTION FUNCTIONS ============
async function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    try {
        peerConnection = new RTCPeerConnection(configuration);
        remoteStream = new MediaStream();
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.setAttribute('playsinline', '');
            remoteVideo.setAttribute('autoplay', '');
        }

        // Add transceivers before adding tracks
        peerConnection.addTransceiver('video', {direction: 'sendrecv'});
        peerConnection.addTransceiver('audio', {direction: 'sendrecv'});

        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log('Added local track:', track.kind);
            });
        }

        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            remoteStream.addTrack(event.track);
            
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                // Try to play when we have both audio and video tracks
                if (remoteStream.getTracks().length === 2) {
                    console.log('Both tracks received, attempting to play');
                    const playPromise = remoteVideo.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.warn('Remote video autoplay failed:', error);
                            createPlayButton(remoteVideo);
                        });
                    }
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
                handleConnectionFailure();
            } else if (peerConnection.iceConnectionState === 'connected') {
                console.log('ICE connection established');
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                console.log('Peer connection established');
            } else if (peerConnection.connectionState === 'failed') {
                console.log('Peer connection failed');
                handleConnectionFailure();
            }
        };

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        showMessage('Error creating connection', 'error');
        throw error;
    }
}

function handleConnectionFailure() {
    console.log('Connection failed, attempting recovery...');
    setTimeout(async () => {
        try {
            if (peerConnection) {
                await peerConnection.restartIce();
                console.log('ICE restart initiated');
            }
        } catch (error) {
            console.error('Failed to recover connection:', error);
            showMessage('Connection lost. Please try reconnecting.', 'error');
            resetVideoCall();
        }
    }, 1000);
}

function createPlayButton(videoElement) {
    const existingButton = videoElement.parentElement.querySelector('.play-button');
    if (existingButton) {
        existingButton.remove();
    }

    const playButton = document.createElement('button');
    playButton.textContent = 'Play Video';
    playButton.className = 'play-button';
    playButton.onclick = () => {
        videoElement.play().catch(console.error);
        playButton.remove();
    };
    videoElement.parentElement.appendChild(playButton);
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
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer, currentRoom);
            console.log('Sent answer');

            // Process any queued candidates after setting remote description
            while (iceCandidatesQueue.length > 0) {
                const candidate = iceCandidatesQueue.shift();
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added queued ICE candidate');
            }
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
async function startCall() {
    try {
        if (await checkMediaPermissions()) {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: { ideal: true },
                    noiseSuppression: { ideal: true }
                }
            }).catch(async (err) => {
                console.warn('Failed with ideal constraints, trying basic setup:', err);
                return await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
            });

            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true;
                localVideo.setAttribute('playsinline', '');
                localVideo.setAttribute('autoplay', '');
                try {
                    await localVideo.play();
                } catch (playError) {
                    console.warn('Local video autoplay failed:', playError);
                    setTimeout(() => localVideo.play().catch(console.error), 1000);
                }
            }

            document.getElementById('connect').style.display = 'none';
            document.getElementById('leave').style.display = 'block';
            document.querySelector('.selection-container').style.display = 'none';
            document.querySelector('.video-container').style.display = 'grid';

            await initializeSocket();
        }
    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access camera/microphone. Please ensure permissions are granted.', 'error');
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
        connectButton.addEventListener('click', startCall);
    }
    
    if (leaveButton) {
        leaveButton.addEventListener('click', leaveCall);
        leaveButton.style.display = 'none';
    }
});