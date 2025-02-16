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
        // Wait for metadata and a short delay
        await new Promise((resolve) => {
            if (videoElement.readyState >= 2) {
                resolve();
            } else {
                videoElement.onloadedmetadata = () => {
                    setTimeout(resolve, 100);
                };
            }
        });
        
        if (videoElement.id === 'localVideo') {
            videoElement.muted = true;
        }
        
        await videoElement.play();
    } catch (error) {
        console.warn('Video play error:', error);
        addPlayButton(videoElement);
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
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, 
            audio: true 
        });
        stream.getTracks().forEach(track => track.stop());
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

        peerConnection.ontrack = async (event) => {
            console.log('Received remote track:', event.track.kind);
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                if (!remoteVideo.srcObject) {
                    remoteVideo.srcObject = new MediaStream();
                }
                remoteVideo.srcObject.addTrack(event.track);
                remoteVideo.setAttribute('playsinline', '');
                
                // Only try to play after both audio and video tracks are added
                const tracks = remoteVideo.srcObject.getTracks();
                if (tracks.length === 2) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        await remoteVideo.play();
                        showMessage('Connected to peer', 'success');
                    } catch (error) {
                        console.warn('Remote video autoplay failed:', error);
                        addPlayButton(remoteVideo);
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
                peerConnection.restartIce();
                showMessage('Connection issue, trying to reconnect...', 'info');
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            switch (peerConnection.connectionState) {
                case 'connected':
                    showMessage('Successfully connected to peer', 'success');
                    break;
                case 'disconnected':
                    showMessage('Connection lost, trying to reconnect...', 'info');
                    break;
                case 'failed':
                    showMessage('Connection failed', 'error');
                    setTimeout(resetVideoCall, 2000);
                    break;
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
            timeout: 20000
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
                const offerDescription = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offerDescription);
                socket.emit('offer', offerDescription, room);
                console.log('Sent offer');
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
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Set remote description from answer');
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
        const hasPermissions = await checkMediaPermissions();
        if (!hasPermissions) {
            showMessage('Camera and microphone access required', 'error');
            return;
        }

        // Basic constraints that work across devices
        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: {
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true }
            }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            console.warn('Failed with ideal constraints, trying basic setup:', error);
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
            await playVideo(localVideo);
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
    if (socket && socket.connected) {
        socket.disconnect();
    }

    localStream = null;
    remoteStream = null;
    currentRoom = null;
    iceCandidatesQueue = [];

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