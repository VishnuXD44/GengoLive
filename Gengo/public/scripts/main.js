import io from 'socket.io-client';
import { configuration } from '../../src/utils/webrtc.js';

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null;
let currentRoom = null;

function showMessage(text, type = 'info') {
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

function enableControls() {
    const connectButton = document.getElementById('connect');
    const languageSelect = document.getElementById('language');
    const roleSelect = document.getElementById('role');
    
    if (connectButton) connectButton.disabled = false;
    if (languageSelect) languageSelect.disabled = false;
    if (roleSelect) roleSelect.disabled = false;
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

async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
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
        throw err;
    }
}

function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        const socketUrl = 'https://gengolive-production.up.railway.app';

        console.log('Connecting to socket URL:', socketUrl);

        const socketIo = io(socketUrl, {
            path: '/socket.io/',
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000,
            withCredentials: false,
            forceNew: true,
            secure: true,
            autoConnect: true,
            rejectUnauthorized: false
        });

        socketIo.on('connect', () => {
            console.log('Successfully connected to socket server');
            const language = document.getElementById('language')?.value;
            const role = document.getElementById('role')?.value;
            
            if (language && role) {
                socketIo.emit('join', { language, role });
                showMessage('Waiting for a match...', 'info');
            }
        });

        socketIo.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            if (error.message.includes('websocket error')) {
                console.log('Falling back to polling transport');
                socketIo.io.opts.transports = ['polling', 'websocket'];
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

async function createAndSendOffer() {
    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer, currentRoom);
    } catch (err) {
        console.error('Error creating offer:', err);
        handleConnectionError();
    }
}

async function startCall() {
    try {
        console.log('Starting call process');
        
        // Disable controls during connection
        const connectButton = document.getElementById('connect');
        const languageSelect = document.getElementById('language');
        const roleSelect = document.getElementById('role');
        if (connectButton) connectButton.disabled = true;
        if (languageSelect) languageSelect.disabled = true;
        if (roleSelect) roleSelect.disabled = true;

        // Get local stream
        await startLocalStream();
        console.log('Local stream started');

        // Show video container and hide selection container
        const selectionContainer = document.getElementById('selection-container');
        const videoContainer = document.getElementById('video-container');
        if (selectionContainer) selectionContainer.style.display = 'none';
        if (videoContainer) videoContainer.style.display = 'block';

        // Initialize socket connection
        socket = initializeSocket();
        if (!socket) {
            throw new Error('Failed to initialize socket');
        }
        console.log('Socket initialized');

        // Initialize peer connection
        peerConnection = await initializePeerConnection();
        if (!peerConnection) {
            throw new Error('Failed to initialize peer connection');
        }
        console.log('Peer connection initialized');

        // Set up socket event listeners
        socket.on('match', async (matchData) => {
            console.log('Matched with peer:', matchData);
            currentRoom = matchData.room;
            
            if (matchData.offer) {
                await createAndSendOffer();
            }
        });

        socket.on('offer', async (offer) => {
            console.log('Received offer');
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('answer', answer, currentRoom);
            } catch (error) {
                console.error('Error handling offer:', error);
                handleConnectionError();
            }
        });

        socket.on('answer', async (answer) => {
            console.log('Received answer');
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error('Error handling answer:', error);
                handleConnectionError();
            }
        });

        socket.on('candidate', async (candidate) => {
            console.log('Received ICE candidate');
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error handling ICE candidate:', error);
                handleConnectionError();
            }
        });

    } catch (error) {
        console.error('Error starting call:', error);
        handleConnectionError();
        throw error;
    }
}

function cleanup() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                localStream.removeTrack(track);
            });
            localStream = null;
        }

        if (remoteStream) {
            remoteStream.getTracks().forEach(track => {
                track.stop();
                remoteStream.removeTrack(track);
            });
            remoteStream = null;
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
        const selectionContainer = document.getElementById('selection-container');
        const videoContainer = document.getElementById('video-container');
        
        if (localVideo) localVideo.srcObject = null;
        if (remoteVideo) remoteVideo.srcObject = null;
        if (selectionContainer) selectionContainer.style.display = 'block';
        if (videoContainer) videoContainer.style.display = 'none';

        currentRoom = null;
        enableControls();
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

// Add event listeners
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');

    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            try {
                await startCall();
            } catch (error) {
                console.error('Failed to start call:', error);
                handleConnectionError();
            }
        });
    }

    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            cleanup();
            showMessage('Call ended', 'info');
        });
    }
});

export { startCall, cleanup, handleConnectionError };