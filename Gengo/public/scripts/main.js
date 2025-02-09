let peerConnection;
let localStream;
let remoteStream;
let socket;
let currentRoom;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Only initialize WebRTC functionality on main.html
if (window.location.pathname.includes('main.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        const connectButton = document.getElementById('connect');
        const leaveButton = document.getElementById('leave');
        const videoContainer = document.getElementById('video-container');
        const selectionContainer = document.getElementById('selection-container');

        if (!connectButton || !videoContainer || !selectionContainer) {
            console.error('Required elements not found');
            return;
        }

        console.log('Connect button found');
        connectButton.addEventListener('click', async () => {
            console.log('Connect button clicked');
            try {
                const language = document.getElementById('language')?.value;
                const role = document.getElementById('role')?.value;
                
                if (!language || !role) {
                    showMessage('Please select language and role', 'warning');
                    return;
                }

                // Disable controls before starting call
                connectButton.disabled = true;
                document.getElementById('language').disabled = true;
                document.getElementById('role').disabled = true;

                await startCall();
                
                selectionContainer.style.display = 'none';
                videoContainer.style.display = 'block';
            } catch (error) {
                console.error('Error in click handler:', error);
                handleConnectionError();
            }
        });

        if (leaveButton) {
            leaveButton.addEventListener('click', () => {
                cleanup();
                selectionContainer.style.display = 'block';
                videoContainer.style.display = 'none';
            });
        }
    });
}

async function startCall() {
    try {
        console.log('Starting call process');
        await startLocalStream();
        console.log('Local stream started');
        
        socket = initializeSocket();
        if (!socket) {
            throw new Error('Failed to initialize socket');
        }
        console.log('Socket initialized');
        
        peerConnection = await initializePeerConnection();
        if (!peerConnection) {
            throw new Error('Failed to initialize peer connection');
        }
        console.log('Peer connection initialized');
    } catch (error) {
        console.error('Error starting call:', error);
        handleConnectionError();
        throw error;
    }
}

function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        const socketIo = io(window.location.origin, {
            path: '/socket.io/',
            transports: ['polling', 'websocket'],
            forceNew: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            randomizationFactor: 0.5,
            timeout: 20000,
            secure: true,
            rejectUnauthorized: false,
            withCredentials: true,
            extraHeaders: {
                'Access-Control-Allow-Origin': '*'
            }
        });

        socketIo.on('connect', () => {
            console.log('Socket connected:', socketIo.id);
            const language = document.getElementById('language')?.value;
            const role = document.getElementById('role')?.value;
            
            if (language && role) {
                socketIo.emit('join', { language, role });
            }
        });

        // Existing socket event handlers...

        socketIo.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            // Fallback mechanism
            if (socketIo.io.opts.transports[0] === 'polling') {
                console.log('Falling back to websocket');
                socketIo.io.opts.transports = ['websocket'];
            }
            handleConnectionError();
        });

        return socketIo;
    } catch (error) {
        console.error('Socket initialization error:', error);
        handleConnectionError();
        return null;
    }
}


async function initializePeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);

        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
                showMessage('Connected to peer', 'success');
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('candidate', event.candidate, currentRoom);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                handleConnectionError();
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'disconnected') {
                handleDisconnection();
            }
        };

        return peerConnection;
    } catch (err) {
        console.error('Error creating peer connection:', err);
        handleConnectionError();
        return null;
    }
}

async function startLocalStream() {
    try {
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.classList.add('active');
            showMessage('Camera and microphone activated', 'success');
        }
        return localStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        handleMediaError();
        throw err;
    }
}

async function createPeerConnection() {
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

async function handleOffer(offer) {
    try {
        if (!peerConnection) {
            throw new Error('No peer connection available');
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        return answer;
    } catch (err) {
        console.error('Error handling offer:', err);
        throw err;
    }
}

async function handleAnswer(answer) {
    try {
        if (!peerConnection) {
            throw new Error('No peer connection available');
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
        throw err;
    }
}

async function handleIceCandidate(candidate) {
    try {
        if (!peerConnection) {
            throw new Error('No peer connection available');
        }
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error('Error handling ICE candidate:', err);
        throw err;
    }
}

function handleConnectionError() {
    showMessage('Connection failed. Please check your internet connection and try again.', 'error');
    cleanup();
    enableControls();
}

function handleDisconnection() {
    showMessage('Lost connection. Attempting to reconnect...', 'warning');
    cleanup();
    enableControls();
}

function handleMediaError() {
    showMessage('Unable to access camera or microphone. Please check your permissions.', 'error');
    enableControls();
}

function enableControls() {
    const connectButton = document.getElementById('connect');
    const languageSelect = document.getElementById('language');
    const roleSelect = document.getElementById('role');
    
    if (connectButton) connectButton.disabled = false;
    if (languageSelect) languageSelect.disabled = false;
    if (roleSelect) roleSelect.disabled = false;
}

function showMessage(text, type) {
    const message = document.createElement('div');
    message.className = `message ${type}-message`;
    message.textContent = text;
    const container = document.querySelector('.container');
    if (container) {
        container.appendChild(message);
    } else {
        document.body.appendChild(message);
    }
    
    setTimeout(() => {
        message.remove();
    }, 5000);
}

function cleanup() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
            localStream.removeTrack(track);
        });
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => {
            track.stop();
            remoteStream.removeTrack(track);
        });
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    localStream = null;
    remoteStream = null;
    currentRoom = null;

    enableControls();
}
