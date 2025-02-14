let localStream;
let remoteStream;
let peerConnection;
let socket;
let currentRoom;

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

async function playVideo(videoElement) {
    try {
        if (videoElement.srcObject) {
            await new Promise((resolve, reject) => {
                if (videoElement.readyState >= 2) {
                    resolve();
                    return;
                }

                const loadedHandler = () => {
                    videoElement.removeEventListener('loadeddata', loadedHandler);
                    videoElement.removeEventListener('error', errorHandler);
                    resolve();
                };

                const errorHandler = (error) => {
                    videoElement.removeEventListener('loadeddata', loadedHandler);
                    videoElement.removeEventListener('error', errorHandler);
                    reject(error);
                };

                videoElement.addEventListener('loadeddata', loadedHandler);
                videoElement.addEventListener('error', errorHandler);
            });

            if (document.hasFocus()) {
                videoElement.muted = true;
                await videoElement.play().catch(error => {
                    console.warn('Initial play failed, retrying with user interaction:', error);
                    addPlayButton(videoElement);
                });
            } else {
                addPlayButton(videoElement);
            }
        }
    } catch (error) {
        console.warn('Video play error:', error);
        addPlayButton(videoElement);
    }
}

function addPlayButton(videoElement) {
    const wrapper = videoElement.parentElement;
    const existingButton = wrapper.querySelector('.play-button');
    if (existingButton) {
        existingButton.remove();
    }

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
        const result = await Promise.all([
            navigator.permissions.query({ name: 'camera' }),
            navigator.permissions.query({ name: 'microphone' })
        ]);

        const [camera, microphone] = result;

        if (camera.state === 'denied' || microphone.state === 'denied') {
            showMessage('Camera and microphone access is required. Please enable them in your browser settings.', 'error');
            return false;
        }

        return true;
    } catch (error) {
        console.error('Permission check error:', error);
        return false;
    }
}

async function startCall() {
    try {
        // Check if permissions are granted
        const permissions = await navigator.permissions.query({ name: 'camera' });
        if (permissions.state === 'denied') {
            showMessage('Camera access is required. Please enable it in your browser settings.', 'error');
            return;
        }

        // Request permissions before starting stream
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((stream) => {
                localStream = stream;
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = stream;
                    localVideo.play().catch(error => {
                        console.warn('Video play error:', error);
                        addPlayButton(localVideo);
                    });
                }

                document.getElementById('connect').style.display = 'none';
                document.getElementById('leave').style.display = 'block';
                document.querySelector('.selection-container').style.display = 'none';
                document.querySelector('.video-container').style.display = 'grid';

                return createPeerConnection();
            })
            .then(() => {
                return initializeSocket();
            })
            .catch((error) => {
                console.error('Media access error:', error);
                if (error.name === 'NotAllowedError') {
                    showMessage('Camera/Microphone access denied. Please grant permissions to use this feature.', 'error');
                } else {
                    showMessage('Failed to access media devices', 'error');
                }
                resetVideoCall();
            });

    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access media devices', 'error');
        resetVideoCall();
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

        peerConnection.ontrack = async (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
                await playVideo(remoteVideo);
                showMessage('Connected to peer', 'success');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected') {
                showMessage('Peer connection lost', 'error');
                resetVideoCall();
            }
        };

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

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
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

    // Add error handling for video elements
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