// Global variables
let socket;
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

// Socket initialization
function initializeSocket() {
    socket = io('https://www.gengo.live', {
        withCredentials: true,
        transports: ['websocket']
    });

    socket.on('match', ({ offer, room }) => {
        console.log('Matched with a peer');
        currentRoom = room;
        if (offer) {
            createPeerConnection()
                .then(offerDescription => {
                    socket.emit('offer', offerDescription, room);
                })
                .catch(err => console.error('Error creating offer:', err));
        }
    });

    socket.on('offer', (offer) => {
        console.log('Received offer');
        createPeerConnection()
            .then(() => handleOffer(offer))
            .then(answer => {
                socket.emit('answer', answer, currentRoom);
            })
            .catch(err => console.error('Error handling offer:', err));
    });

    socket.on('answer', (answer) => {
        console.log('Received answer');
        handleAnswer(answer)
            .catch(err => console.error('Error handling answer:', err));
    });

    socket.on('candidate', (candidate) => {
        console.log('Received ICE candidate');
        handleIceCandidate(candidate)
            .catch(err => console.error('Error handling ICE candidate:', err));
    });

    return socket;
}

// Peer connection initialization
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
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', event.candidate, currentRoom);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'failed') {
                handleConnectionError();
            }
        };

    } catch (err) {
        console.error('Error creating peer connection:', err);
        handleConnectionError();
    }
}

// Media stream handling
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
        return localStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        handleMediaError();
    }
}

// Error handling functions
function handleConnectionError() {
    showMessage('Connection failed. Please check your internet connection and try again.', 'error');
}

function handleDisconnection(reason) {
    showMessage('Lost connection. Attempting to reconnect...', 'warning');
}

function handleMediaError() {
    showMessage('Unable to access camera or microphone. Please check your permissions.', 'error');
}

// UI feedback
function showMessage(text, type) {
    const message = document.createElement('div');
    message.className = `message ${type}-message`;
    message.textContent = text;
    document.body.appendChild(message);
    
    setTimeout(() => {
        message.remove();
    }, 5000);
}

// Cleanup
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
}

// Export functions
export {
    initializeSocket,
    initializePeerConnection,
    startLocalStream,
    handleConnectionError,
    handleDisconnection,
    handleMediaError,
    showMessage,
    cleanup
};
