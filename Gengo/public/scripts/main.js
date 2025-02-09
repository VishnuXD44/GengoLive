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

document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    const videoContainer = document.getElementById('video-container');
    const selectionContainer = document.getElementById('selection-container');

    if (connectButton) {
        console.log('Connect button found');
        connectButton.addEventListener('click', async () => {
            console.log('Connect button clicked');
            try {
                const language = document.getElementById('language').value;
                const role = document.getElementById('role').value;
                
                if (!language || !role) {
                    showMessage('Please select language and role', 'warning');
                    return;
                }

                connectButton.disabled = true;
                await startCall();
                
                // Show video container and hide selection container
                if (videoContainer && selectionContainer) {
                    selectionContainer.style.display = 'none';
                    videoContainer.style.display = 'block';
                }
            } catch (error) {
                console.error('Error in click handler:', error);
                handleConnectionError();
            }
        });
    } else {
        console.error('Connect button not found in DOM');
    }

    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            cleanup();
            // Show selection container and hide video container
            if (videoContainer && selectionContainer) {
                videoContainer.style.display = 'none';
                selectionContainer.style.display = 'block';
            }
        });
    }
});

function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        const socketIo = io(window.location.origin, {
            path: '/socket.io',
            transports: ['websocket', 'polling']
        });

        socketIo.on('connect', () => {
            console.log('Socket connected:', socketIo.id);
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            socketIo.emit('join', { language, role });
        });

        socketIo.on('match', async ({ offer, room }) => {
            console.log('Matched with peer, room:', room);
            currentRoom = room;
            if (offer) {
                const offerDescription = await createPeerConnection();
                socketIo.emit('offer', offerDescription, room);
            }
        });

        socketIo.on('offer', async (offer) => {
            console.log('Received offer');
            const answer = await handleOffer(offer);
            socketIo.emit('answer', answer, currentRoom);
        });

        socketIo.on('answer', async (answer) => {
            console.log('Received answer');
            await handleAnswer(answer);
        });

        socketIo.on('candidate', async (candidate) => {
            console.log('Received ICE candidate');
            await handleIceCandidate(candidate);
        });

        socketIo.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            handleConnectionError();
        });

        return socketIo;
    } catch (error) {
        console.error('Socket initialization error:', error);
        handleConnectionError();
        return null;
    }
}

// ... [keep all other functions the same] ...

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

    enableControls();
}
