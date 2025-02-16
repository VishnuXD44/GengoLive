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
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
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

// ============ WEBRTC CONNECTION FUNCTIONS ============
async function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    try {
        peerConnection = new RTCPeerConnection(configuration);

        // Add transceivers before adding tracks
        peerConnection.addTransceiver('video', { direction: 'sendrecv' });
        peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log('Added local track:', track.kind);
            });
        } else {
            console.warn('Local stream not available while adding tracks.');
        }

        // Enhanced remote track handler with fallback and delayed play
        peerConnection.ontrack = (event) => {
            console.log('ontrack event fired:', event);
            let stream = event.streams && event.streams[0];
            if (!stream) {
                // Fallback: create a new stream from the received track
                stream = new MediaStream();
                stream.addTrack(event.track);
                console.warn('No stream provided in event; created fallback stream', stream);
            }
            remoteStream = stream;
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.setAttribute('playsinline', '');
                remoteVideo.autoplay = true;
                // Delay play() slightly to allow the element to settle
                setTimeout(() => {
                    remoteVideo.play().then(() => {
                        console.log('Remote video playing successfully');
                    }).catch((error) => {
                        console.warn('Remote video autoplay failed on retry:', error);
                    });
                }, 500);
            } else {
                console.error('Remote video element not found in DOM.');
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && currentRoom) {
                socket.emit('candidate', event.candidate, currentRoom);
                console.log('Sent ICE candidate:', event.candidate);
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                console.warn('ICE connection failed, restarting ICE...');
                peerConnection.restartIce();
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                showMessage('Connected to peer', 'success');
            } else if (peerConnection.connectionState === 'failed') {
                showMessage('Connection failed', 'error');
                setTimeout(resetVideoCall, 2000);
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
            reconnectionAttempts: 5,
            timeout: 10000
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
    socket.on('match', async ({ offer, room, role }) => {
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
                console.log('Offer sent:', offerDescription);
            }
        } catch (error) {
            console.error('Error in match:', error);
            showMessage('Connection error', 'error');
        }
    });

    socket.on('offer', async (offer) => {
        console.log('Received offer:', offer);
        try {
            if (!peerConnection) {
                await createPeerConnection();
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('Remote description set for offer');

            // Process any queued ICE candidates
            if (iceCandidatesQueue.length > 0) {
                for (const queuedCandidate of iceCandidatesQueue) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(queuedCandidate));
                    console.log('Added queued ICE candidate');
                }
                iceCandidatesQueue = [];
            }

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer, currentRoom);
            console.log('Answer sent:', answer);
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Error handling offer', 'error');
        }
    });

    socket.on('answer', async (answer) => {
        console.log('Received answer:', answer);
        try {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Remote description set for answer');

                // Process any queued ICE candidates
                if (iceCandidatesQueue.length > 0) {
                    for (const queuedCandidate of iceCandidatesQueue) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(queuedCandidate));
                        console.log('Added queued ICE candidate');
                    }
                    iceCandidatesQueue = [];
                }
            }
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Error handling answer', 'error');
        }
    });

    socket.on('candidate', async (candidate) => {
        console.log('Received ICE candidate:', candidate);
        try {
            if (peerConnection) {
                if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('Added ICE candidate');
                } else {
                    iceCandidatesQueue.push(candidate);
                    console.log('Queued ICE candidate until remote description is set');
                }
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
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        console.log('Local stream obtained:', localStream);
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.setAttribute('playsinline', '');
            localVideo.autoplay = true;

            // Force play with retry for local video
            const playLocal = async () => {
                try {
                    await localVideo.play();
                    console.log('Local video playing successfully');
                } catch (error) {
                    console.warn('Local video autoplay failed, retrying:', error);
                    setTimeout(playLocal, 1000);
                }
            };
            await playLocal();
        }

        document.getElementById('connect').style.display = 'none';
        document.getElementById('leave').style.display = 'block';
        document.querySelector('.selection-container').style.display = 'none';
        document.querySelector('.video-container').style.display = 'grid';

        await initializeSocket();
    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access camera/microphone', 'error');
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
        localVideo.load();
    }
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        remoteVideo.load();
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
