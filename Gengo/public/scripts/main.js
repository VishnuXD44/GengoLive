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
async function playVideo(videoElement) {
    if (!videoElement.srcObject) return;
    
    try {
        if (videoElement.readyState < 2) {
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => resolve();
            });
        }
        
        if (videoElement.id === 'localVideo') {
            videoElement.muted = true;
        }
        
        await videoElement.play();
    } catch (error) {
        console.warn('Video play error:', error);
        if (videoElement.id === 'remoteVideo') {
            addPlayButton(videoElement);
        }
    }
}

function addPlayButton(videoElement) {
    const wrapper = videoElement.parentElement;
    const existingButton = wrapper.querySelector('.play-button');
    if (existingButton) existingButton.remove();

    const playButton = document.createElement('button');
    playButton.className = 'play-button';
    playButton.innerHTML = '▶';
    wrapper.appendChild(playButton);

    playButton.onclick = async () => {
        try {
            await videoElement.play();
            playButton.remove();
        } catch (error) {
            console.error('Play failed:', error);
            showMessage('Failed to play video', 'error');
        }
    };
}

async function checkMediaPermissions() {
    try {
        const [camera, microphone] = await Promise.all([
            navigator.permissions.query({ name: 'camera' }),
            navigator.permissions.query({ name: 'microphone' })
        ]);

        if (camera.state === 'denied' || microphone.state === 'denied') {
            showMessage('Camera and microphone access required', 'error');
            return false;
        }
        return true;
    } catch (error) {
        console.error('Permission check error:', error);
        return false;
    }
}

// ============ WEBRTC CONNECTION FUNCTIONS ============
async function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }

    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log('Added local track:', track.kind);
            });
        }
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && currentRoom) {
                console.log('Sending ICE candidate');
                socket.emit('candidate', event.candidate, currentRoom);
            }
        };

        peerConnection.ontrack = async (event) => {
            console.log('Received remote track:', event.track.kind);
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
                try {
                    await remoteVideo.play();
                    showMessage('Connected to peer', 'success');
                } catch (error) {
                    console.warn('Remote video autoplay failed:', error);
                    addPlayButton(remoteVideo);
                }
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            switch (peerConnection.connectionState) {
                case 'connected':
                    showMessage('Successfully connected to peer', 'success');
                    break;
                case 'disconnected':
                    showMessage('Peer disconnected', 'info');
                    break;
                case 'failed':
                    showMessage('Connection failed', 'error');
                    resetVideoCall();
                    break;
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
        };

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        showMessage('Error creating connection', 'error');
        throw error;
    }
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

// ============ SOCKET COMMUNICATION FUNCTIONS ============
function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        socket = io(window.location.origin, {
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

function setupSocketListeners() {
    socket.on('match', async ({ offer, room, role }) => {
        console.log(`Matched in room: ${room}, initiating offer: ${offer}, role: ${role}`);
        currentRoom = room;

        try {
            await createPeerConnection();
            if (offer) {
                const offerDescription = await createOffer();
                await peerConnection.setLocalDescription(offerDescription);
                socket.emit('offer', offerDescription, room);
                console.log('Sent offer as:', role);
            }
        } catch (error) {
            console.error('Error in match handling:', error);
            showMessage('Error establishing connection', 'error');
        }
    });

    socket.on('offer', async (offer) => {
        try {
            console.log('Received offer');
            if (!peerConnection) {
                await createPeerConnection();
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            while (iceCandidatesQueue.length > 0) {
                const candidate = iceCandidatesQueue.shift();
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added queued ICE candidate');
            }

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
            console.log('Received answer');
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Set remote description from answer');
                
                while (iceCandidatesQueue.length > 0) {
                    const candidate = iceCandidatesQueue.shift();
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('Added queued ICE candidate');
                }
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
}

// ============ CALL MANAGEMENT FUNCTIONS ============
async function startCall() {
    try {
        const hasPermissions = await checkMediaPermissions();
        if (!hasPermissions) {
            showMessage('Camera and microphone access required', 'error');
            return;
        }

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
            localVideo.muted = true;
            await new Promise((resolve) => {
                localVideo.onloadedmetadata = () => resolve();
            });
            await localVideo.play();
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
    iceCandidatesQueue = [];

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

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

// ============ UI FUNCTIONS ============
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
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
            } else {
                showMessage('Please grant camera and microphone permissions to continue', 'error');
            }
        });
    }
    
    if (leaveButton) {
        leaveButton.addEventListener('click', leaveCall);
        leaveButton.style.display = 'none';
    }

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');

    if (localVideo) {
        localVideo.onerror = (error) => {
            console.error('Local video error:', error);
            showMessage('Error displaying local video', 'error');
        };
    }

    if (remoteVideo) {
        remoteVideo.onerror = (error) => {
            console.error('Remote video error:', error);
            showMessage('Error displaying remote video', 'error');
        };
    }
});