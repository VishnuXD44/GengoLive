import io from 'socket.io-client';
import { startLocalStream, createPeerConnection, handleOffer as webrtcHandleOffer, handleAnswer as webrtcHandleAnswer, handleIceCandidate, cleanup as webrtcCleanup } from '../../src/utils/webrtc.js';

const configuration = {
    iceServers: [
        { 
            urls: [
                'stun:stun.l.google.com:19302', 
                'stun:stun1.l.google.com:19302'
            ]
        }
    ]
};

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

function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        const socketUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://gengolive-production.up.railway.app';

        console.log('Connecting to socket URL:', socketUrl);

        const socketIo = io(socketUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000,
            withCredentials: true,
            forceNew: true,
            secure: true,
            extraHeaders: {
                'Access-Control-Allow-Origin': '*'
            }
        });

        socketIo.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            console.error('Error details:', {
                message: error.message,
                description: error.description,
                type: error.type
            });
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
        
        if (localVideo) {
            localVideo.srcObject = null;
            localVideo.classList.remove('active');
        }
        
        if (remoteVideo) {
            remoteVideo.srcObject = null;
        }

        currentRoom = null;

        enableControls();
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    if (connectButton) {
        connectButton.addEventListener('click', startCall);
    }
});

window.startCall = startCall;
window.handleConnectionError = handleConnectionError;
window.cleanup = cleanup;
window.webrtcCleanup = webrtcCleanup;