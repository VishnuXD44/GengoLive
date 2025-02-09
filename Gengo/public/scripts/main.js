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

// Helper Functions
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

function handleConnectionError() {
    showMessage('Connection failed. Please check your internet connection and try again.', 'error');
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
        const socketUrl = process.env.NODE_ENV === 'production' 
            ? 'https://www.gengo.live'
            : 'http://localhost:3000';

        const socketIo = io(socketUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000,
            withCredentials: true,
            autoConnect: true,
            forceNew: true,
            extraHeaders: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });

        socketIo.on('connect', () => {
            console.log('Socket connected successfully:', socketIo.id);
            const language = document.getElementById('language')?.value;
            const role = document.getElementById('role')?.value;
            
            if (language && role) {
                socketIo.emit('join', { language, role });
            }
        });

        socketIo.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            if (error.message.includes('xhr poll error')) {
                console.log('Falling back to websocket only');
                socketIo.io.opts.transports = ['websocket'];
                socketIo.connect();
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

// WebRTC initialization only on main.html
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

// Export necessary functions and variables
export {
    initializeSocket,
    startCall,
    cleanup,
    handleConnectionError,
    handleMediaError,
    showMessage,
    enableControls
};