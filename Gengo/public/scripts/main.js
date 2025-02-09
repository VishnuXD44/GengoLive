// Import necessary modules
import { io } from 'socket.io-client/dist/socket.io.js';

// WebRTC Configuration
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

// Global variables
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null;
let currentRoom = null;

// Utility Functions
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

// Local Stream Management
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

// Socket Initialization
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
            autoConnect: true
        });

        socketIo.on('connect', () => {
            console.log('Socket connected successfully:', socketIo.id);
            const language = document.getElementById('language')?.value;
            const role = document.getElementById('role')?.value;
            
            if (language && role) {
                socketIo.emit('join', { language, role });
            }
        });

        socketIo.on('match', async (matchData) => {
            console.log('Matched with peer', matchData);
            currentRoom = matchData.room;

            // Determine if this peer should create the offer
            if (matchData.offer) {
                await createAndSendOffer();
            }
        });

        socketIo.on('offer', async (offer) => {
            console.log('Received offer');
            await handleOffer(offer);
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

// Peer Connection Management
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

// WebRTC Signaling Methods
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

async function handleOffer(offer) {
    try {
        if (!peerConnection) {
            throw new Error('No peer connection available');
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer, currentRoom);
    } catch (err) {
        console.error('Error handling offer:', err);
        handleConnectionError();
    }
}

async function handleAnswer(answer) {
    try {
        if (!peerConnection) {
            throw new Error('No peer connection available');
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
        handleConnectionError();
    }
}

async function handleIceCandidate(candidate) {
    try {
        if (!peerConnection) {
            throw new Error('No peer connection available');
        }
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error('Error handling ICE candidate:', err);
        handleConnectionError();
    }
}

// Call Initialization
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

// Cleanup Function
function cleanup() {
    try {
        // Stop local media tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                localStream.removeTrack(track);
            });
            localStream = null;
        }

        // Stop remote media tracks
        if (remoteStream) {
            remoteStream.getTracks().forEach(track => {
                track.stop();
                remoteStream.removeTrack(track);
            });
            remoteStream = null;
        }

        // Close peer connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        // Disconnect socket
        if (socket) {
            socket.disconnect();
            socket = null;
        }

        // Clear video sources
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        
        if (localVideo) {
            localVideo.srcObject = null;
            localVideo.classList.remove('active');
        }
        
        if (remoteVideo) {
            remoteVideo.srcObject = null;
        }

        // Reset room
        currentRoom = null;

        // Re-enable controls
        enableControls();
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

// Event Listeners and Page Initialization
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    if (connectButton) {
        connectButton.addEventListener('click', startCall);
    }
});

// Attach functions to the global window object
window.startCall = startCall;
window.handleConnectionError = handleConnectionError;
window.cleanup = cleanup;