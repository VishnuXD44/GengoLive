let localStream;
let remoteStream;
let peerConnection;
let socket;
let currentRoom;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

// Add this helper function at the top of the file
async function playVideo(videoElement) {
    try {
        // Only attempt to play if the video has content
        if (videoElement.srcObject) {
            // Wait for the loadedmetadata event
            await new Promise((resolve) => {
                if (videoElement.readyState >= 2) {
                    resolve();
                } else {
                    videoElement.addEventListener('loadedmetadata', () => {
                        resolve();
                    });
                }
            });
            
            await videoElement.play();
        }
    } catch (error) {
        console.warn('Video play error:', error);
        // We don't throw here as this is not a critical error
    }
}

// Update the startCall function
async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        });
        
        // Update UI first
        document.getElementById('connect').style.display = 'none';
        document.getElementById('leave').style.display = 'block';
        document.querySelector('.selection-container').style.display = 'none';
        document.querySelector('.video-container').style.display = 'grid';

        // Set up local video
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            await playVideo(localVideo);
        }

        // Initialize connections
        await createPeerConnection();
        await initializeSocket();
    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access media devices', 'error');
        resetVideoCall();
    }
}

// Update the createPeerConnection function's ontrack handler
function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        // ...existing code...

        peerConnection.ontrack = async (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
                await playVideo(remoteVideo);
                showMessage('Connected to peer', 'success');
            }
        };

        // ...rest of the existing code...
    } catch (error) {
        console.error('Error creating peer connection:', error);
        showMessage('Error creating connection', 'error');
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    
    if (connectButton) {
        connectButton.addEventListener('click', startCall);
    }
    
    if (leaveButton) {
        leaveButton.addEventListener('click', leaveCall);
    }

    // Hide leave button initially
    if (leaveButton) {
        leaveButton.style.display = 'none';
    }
});

function setupSocketListeners() {
    socket.on('match', async ({ offer, room }) => {
        currentRoom = room;
        if (offer) {
            try {
                const offerDescription = await createOffer();
                socket.emit('offer', offerDescription, room);
            } catch (error) {
                console.error('Error creating offer:', error);
                showMessage('Error creating offer', 'error');
            }
        }
    });

    socket.on('offer', async (offer) => {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
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
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Error handling answer', 'error');
        }
    });

    socket.on('candidate', async (candidate) => {
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
            showMessage('Error handling connection', 'error');
        }
    });

    socket.on('user-disconnected', () => {
        showMessage('Peer disconnected', 'info');
        resetVideoCall();
    });
}

async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        return offer;
    } catch (error) {
        console.error('Error creating offer:', error);
        throw error;
    }
}

function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && currentRoom) {
                socket.emit('candidate', event.candidate, currentRoom);
            }
        };

        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
                showMessage('Connected to peer', 'success');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected') {
                showMessage('Peer connection lost', 'error');
                resetVideoCall();
            }
        };

        // Add local tracks to the connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        showMessage('Error creating connection', 'error');
        throw error;
    }
}

function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        const socketUrl = window.location.origin;

        socket = io(socketUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            showMessage('Connected to server', 'success');
            
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            
            socket.emit('join', { language, role });
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            showMessage('Connection failed', 'error');
            resetVideoCall();
        });

        setupSocketListeners();
    } catch (error) {
        console.error('Socket initialization error:', error);
        showMessage('Failed to connect to server', 'error');
        resetVideoCall();
    }
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        });
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            await localVideo.play().catch(console.error);
        }

        document.getElementById('connect').style.display = 'none';
        document.getElementById('leave').style.display = 'block';
        document.querySelector('.selection-container').style.display = 'none';
        document.querySelector('.video-container').style.display = 'grid';

        await createPeerConnection();
        await initializeSocket();
    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access media devices', 'error');
        resetVideoCall();
    }
}

function resetVideoCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    if (socket) {
        socket.disconnect();
    }

    localStream = null;
    remoteStream = null;
    peerConnection = null;
    currentRoom = null;

    document.getElementById('localVideo').srcObject = null;
    document.getElementById('remoteVideo').srcObject = null;
    document.querySelector('.video-container').style.display = 'none';
    document.querySelector('.selection-container').style.display = 'flex';
    document.getElementById('connect').style.display = 'block';
    document.getElementById('leave').style.display = 'none';
}

function leaveCall() {
    try {
        resetVideoCall();
        showMessage('Call ended', 'info');
    } catch (error) {
        console.error('Error leaving call:', error);
        showMessage('Error ending call', 'error');
    }
}