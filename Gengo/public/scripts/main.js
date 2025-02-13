let localStream;
let remoteStream;
let peerConnection;
let socket;

// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    
    if (connectButton) {
        connectButton.addEventListener('click', startCall);
    }
    
    if (leaveButton) {
        leaveButton.addEventListener('click', leaveCall);
    }
});

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
            timeout: 20000,
            withCredentials: true,
            forceNew: true,
            secure: true
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            showMessage('Connected to server', 'success');
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            showMessage('Connection failed', 'error');
        });

        setupSocketListeners();
    } catch (error) {
        console.error('Socket initialization error:', error);
        showMessage('Failed to connect to server', 'error');
    }
}

// ... rest of your existing socket and WebRTC handling code ...

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
            video: true,
            audio: true
        });

        document.getElementById('localVideo').srcObject = localStream;
        document.querySelector('.selection-container').style.display = 'none';
        document.querySelector('.video-container').style.display = 'block';

        initializeSocket();
        createPeerConnection();
    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access media devices', 'error');
    }
}

function leaveCall() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (peerConnection) {
            peerConnection.close();
        }
        if (socket) {
            socket.disconnect();
        }

        document.querySelector('.video-container').style.display = 'none';
        document.querySelector('.selection-container').style.display = 'flex';
        
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('remoteVideo').srcObject = null;

        showMessage('Call ended', 'info');
    } catch (error) {
        console.error('Error leaving call:', error);
        showMessage('Error ending call', 'error');
    }
}