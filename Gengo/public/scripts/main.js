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

// ============ MEDIA HANDLING FUNCTIONS ============
async function checkMediaPermissions() {
    try {
        // Only check if the API exists
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

        // Add transceivers before adding tracks
        peerConnection.addTransceiver('video', {direction: 'sendrecv'});
        peerConnection.addTransceiver('audio', {direction: 'sendrecv'});

        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log('Added local track:', track.kind);
            });
        }

        // Update the ontrack handler in createPeerConnection function
        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                // Use the stream directly from the event
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
                remoteVideo.setAttribute('playsinline', '');

                // Ensure video plays when tracks are added
                const playVideo = async () => {
                    try {
                        // Wait for loadedmetadata event
                        await new Promise((resolve) => {
                            if (remoteVideo.readyState >= 2) {
                                resolve();
                            } else {
                                remoteVideo.onloadedmetadata = () => resolve();
                            }
                        });
                        await remoteVideo.play();
                        console.log('Remote video playing successfully');
                    } catch (error) {
                        console.warn('Remote video autoplay failed, retrying:', error);
                        // Retry after a delay
                        setTimeout(playVideo, 1000);
                    }
                };
                playVideo();
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
                peerConnection.restartIce();
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
                // Add delay before creating offer
                await new Promise(resolve => setTimeout(resolve, 1000));
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
        // First check API availability
        if (await checkMediaPermissions()) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,  // Simplified constraints
                    audio: true
                });

                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.muted = true;
                    localVideo.setAttribute('playsinline', '');
                    
                    // Wait for metadata before playing
                    await new Promise((resolve) => {
                        if (localVideo.readyState >= 2) {
                            resolve();
                        } else {
                            localVideo.onloadedmetadata = () => resolve();
                        }
                    });
                    
                    await localVideo.play();
                }

                // Update UI first
                document.getElementById('connect').style.display = 'none';
                document.getElementById('leave').style.display = 'block';
                document.querySelector('.selection-container').style.display = 'none';
                document.querySelector('.video-container').style.display = 'grid';

                // Then initialize connection
                await initializeSocket();
            } catch (mediaError) {
                console.error('Media error:', mediaError);
                showMessage('Failed to access camera/microphone', 'error');
                resetVideoCall();
            }
        }
    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to start call', 'error');
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