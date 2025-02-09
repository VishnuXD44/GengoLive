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
            if (videoContainer && selectionContainer) {
                videoContainer.style.display = 'none';
                selectionContainer.style.display = 'block';
            }
        });
    }
});

async function startCall() {
    try {
        console.log('Starting call process');
        await startLocalStream();
        console.log('Local stream started');
        
        socket = initializeSocket();
        console.log('Socket initialized');
        
        peerConnection = await initializePeerConnection();
        console.log('Peer connection initialized');
        
        if (!peerConnection || !socket) {
            throw new Error('Failed to initialize connections');
        }
    } catch (error) {
        console.error('Error starting call:', error);
        handleConnectionError();
    }
}

function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        const socketIo = io(window.location.origin, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            secure: true,
            reconnection: true,
            rejectUnauthorized: false,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
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
            if (socketIo.io.opts.transports[0] === 'websocket') {
                console.log('Falling back to polling');
                socketIo.io.opts.transports = ['polling'];
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
