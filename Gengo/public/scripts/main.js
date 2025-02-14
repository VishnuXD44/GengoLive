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

function setupSocketListeners() {
    socket.on('offer', async (offer) => {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer);
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
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
            showMessage('Error handling connection', 'error');
        }
    });

    socket.on('user-connected', (userId) => {
        console.log('User connected:', userId);
        showMessage('User connected', 'success');
    });

    socket.on('user-disconnected', (userId) => {
        console.log('User disconnected:', userId);
        showMessage('User disconnected', 'info');
    });
}

function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', event.candidate);
            }
        };

        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
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
            
            // Get selected language and role
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            
            // Emit join event with user preferences
            socket.emit('join', { language, role });
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
        
        document.getElementById('connect').style.display = 'none';
        document.getElementById('leave').style.display = 'block';
        document.getElementById('localVideo').srcObject = localStream;
        document.querySelector('.selection-container').style.display = 'none';
        document.querySelector('.video-container').style.display = 'grid';

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
        document.getElementById('connect').style.display = 'block';
        document.getElementById('leave').style.display = 'none';

        showMessage('Call ended', 'info');
    } catch (error) {
        console.error('Error leaving call:', error);
        showMessage('Error ending call', 'error');
    }
}