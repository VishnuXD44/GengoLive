// Global variables
const socket = io; // Using globally available io from CDN
let peerConnection;
let localStream;
let remoteStream;
let currentRoom;

// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Initialize everything when the document loads
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    const languageSelect = document.getElementById('languageSelect');
    const roleSelect = document.getElementById('roleSelect');

    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            try {
                const language = languageSelect.value;
                const role = roleSelect.value;
                
                if (!language || !role) {
                    showMessage('Please select both language and role', 'error');
                    return;
                }

                connectButton.disabled = true;
                await startLocalStream();
                initializeSocket();
                socket.emit('join', { language, role });
                showMessage('Connecting...', 'info');
            } catch (err) {
                console.error('Connection failed:', err);
                handleConnectionError();
                connectButton.disabled = false;
            }
        });
    }
});

function initializeSocket() {
    const socketInstance = io('https://www.gengo.live', {
        withCredentials: true,
        transports: ['websocket']
    });

    socketInstance.on('connect', () => {
        console.log('Socket connected');
        showMessage('Connected to server', 'success');
    });

    socketInstance.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        handleConnectionError();
    });

    socketInstance.on('match', async ({ offer, room }) => {
        console.log('Matched with a peer');
        currentRoom = room;
        showMessage('Found a match!', 'success');

        try {
            await initializePeerConnection();
            if (offer) {
                const offerDescription = await createPeerConnection();
                socketInstance.emit('offer', offerDescription, room);
            }
        } catch (err) {
            console.error('Error in match handling:', err);
            handleConnectionError();
        }
    });

    socketInstance.on('offer', async (offer) => {
        console.log('Received offer');
        try {
            await initializePeerConnection();
            const answer = await handleOffer(offer);
            socketInstance.emit('answer', answer, currentRoom);
        } catch (err) {
            console.error('Error handling offer:', err);
            handleConnectionError();
        }
    });

    socketInstance.on('answer', async (answer) => {
        console.log('Received answer');
        try {
            await handleAnswer(answer);
        } catch (err) {
            console.error('Error handling answer:', err);
            handleConnectionError();
        }
    });

    socketInstance.on('candidate', async (candidate) => {
        console.log('Received ICE candidate');
        try {
            await handleIceCandidate(candidate);
        } catch (err) {
            console.error('Error handling ICE candidate:', err);
        }
    });

    socketInstance.on('disconnect', () => {
        console.log('Disconnected from server');
        handleDisconnection();
    });

    return socketInstance;
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
            if (remoteVideo) {
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

        return peerConnection;
    } catch (err) {
        console.error('Error creating peer connection:', err);
        handleConnectionError();
        throw err;
    }
}

async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
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
    const connectButton = document.getElementById('connectButton');
    const languageSelect = document.getElementById('languageSelect');
    const roleSelect = document.getElementById('roleSelect');
    
    if (connectButton) connectButton.disabled = false;
    if (languageSelect) languageSelect.disabled = false;
    if (roleSelect) roleSelect.disabled = false;
}

function showMessage(text, type) {
    const message = document.createElement('div');
    message.className = `message ${type}-message`;
    message.textContent = text;
    document.body.appendChild(message);
    
    setTimeout(() => {
        message.remove();
    }, 5000);
}

function cleanup() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    if (socket) {
        socket.disconnect();
    }

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
}

async function createPeerConnection() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        return offer;
    } catch (err) {
        console.error('Error creating offer:', err);
        throw err;
    }
}

async function handleOffer(offer) {
    try {
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
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
        throw err;
    }
}

async function handleIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error('Error handling ICE candidate:', err);
        throw err;
    }
}
