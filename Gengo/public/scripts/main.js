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
    
    setTimeout(() => message.remove(), 5000);
}

function enableControls() {
    const connectButton = document.getElementById('connect');
    const languageSelect = document.getElementById('language');
    const roleSelect = document.getElementById('role');
    
    if (connectButton) connectButton.disabled = false;
    if (languageSelect) languageSelect.disabled = false;
    if (roleSelect) roleSelect.disabled = false;
}

async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.setAttribute('playsinline', '');
        }

        const selectionContainer = document.getElementById('selection-container');
        const videoContainer = document.getElementById('video-container');
        
        if (selectionContainer) selectionContainer.style.display = 'none';
        if (videoContainer) videoContainer.style.display = 'block';

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

        socketIo.on('match', async (matchData) => {
            console.log('Matched with peer:', matchData);
            currentRoom = matchData.room;
            
            if (matchData.offer) {
                await createAndSendOffer();
            }
        });

        socketIo.on('offer', async (offer) => {
            console.log('Received offer');
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socketIo.emit('answer', answer, currentRoom);
            } catch (error) {
                console.error('Error handling offer:', error);
                handleConnectionError();
            }
        });

        socketIo.on('answer', async (answer) => {
            console.log('Received answer');
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error('Error handling answer:', error);
                handleConnectionError();
            }
        });

        socketIo.on('candidate', async (candidate) => {
            console.log('Received ICE candidate');
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error handling ICE candidate:', error);
                handleConnectionError();
            }
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
                remoteVideo.setAttribute('playsinline', '');
                remoteStream = event.streams[0];
                showMessage('Connected to peer', 'success');
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('candidate', event.candidate, currentRoom);
            }
        };

        return peerConnection;
    } catch (err) {
        console.error('Error creating peer connection:', err);
        handleConnectionError();
        return null;
    }
}

async function startCall() {
    try {
        console.log('Starting call process');
        await startLocalStream();
        
        socket = initializeSocket();
        if (!socket) throw new Error('Failed to initialize socket');
        
        peerConnection = await initializePeerConnection();
        if (!peerConnection) throw new Error('Failed to initialize peer connection');
        
        showMessage('Connecting...', 'info');
    } catch (error) {
        console.error('Error starting call:', error);
        handleConnectionError();
    }
}

function cleanup() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
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

        const selectionContainer = document.getElementById('selection-container');
        const videoContainer = document.getElementById('video-container');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        
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

document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');

    if (connectButton) {
        connectButton.addEventListener('click', startCall);
    }

    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            cleanup();
            showMessage('Call ended', 'info');
        });
    }
});