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
        setTimeout(() => message.remove(), 5000);
    }
}

function handleMediaError() {
    showMessage('Unable to access camera/microphone. Please check permissions.', 'error');
    cleanup();
    enableControls();
}

function handleConnectionError() {
    showMessage('Connection lost. Trying to reconnect...', 'error');
    cleanup();
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

async function startLocalStream() {
    try {
        // More flexible constraints for different devices
        const constraints = {
            video: {
                width: { min: 640, ideal: 1280, max: 1920 },
                height: { min: 480, ideal: 720, max: 1080 },
                facingMode: 'user',
                frameRate: { ideal: 30, max: 60 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                sampleSize: 16
            }
        };

        // Try getting media with ideal constraints first
        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            console.log('Falling back to basic constraints');
            // Fallback to basic constraints
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            // Add playsinline for iOS Safari
            localVideo.setAttribute('playsinline', '');
            // Add muted for autoplay
            localVideo.muted = true;
            // Ensure autoplay works
            try {
                await localVideo.play();
            } catch (e) {
                console.warn('Autoplay failed:', e);
                showMessage('Tap to start video', 'info');
            }
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
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            withCredentials: false,
            forceNew: true,
            secure: true,
            autoConnect: true,
            rejectUnauthorized: false,
            extraHeaders: {
                'User-Agent': navigator.userAgent
            }
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
            console.error('Connection error:', error);
            if (error.message.includes('websocket error')) {
                console.log('Falling back to polling transport');
                socketIo.io.opts.transports = ['polling', 'websocket'];
            }
            handleConnectionError();
        });

        // Enhanced error handling and reconnection logic
        socketIo.on('reconnect_attempt', () => {
            console.log('Attempting to reconnect...');
            showMessage('Reconnecting...', 'warning');
        });

        socketIo.on('reconnect', () => {
            console.log('Reconnected successfully');
            showMessage('Reconnected', 'success');
        });

        socketIo.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            if (reason === 'io server disconnect') {
                socketIo.connect(); // Automatically reconnect if server disconnected
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

        // Add transceivers for better browser compatibility
        peerConnection.addTransceiver('video', {direction: 'sendrecv'});
        peerConnection.addTransceiver('audio', {direction: 'sendrecv'});

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
                
                // Ensure remote video plays
                remoteVideo.play().catch(e => {
                    console.warn('Remote video autoplay failed:', e);
                    showMessage('Tap to start remote video', 'info');
                });
                
                showMessage('Connected to peer', 'success');
            }
        };

        // Enhanced connection state monitoring
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
            switch(peerConnection.iceConnectionState) {
                case 'checking':
                    showMessage('Connecting to peer...', 'info');
                    break;
                case 'connected':
                    showMessage('Connection established', 'success');
                    break;
                case 'disconnected':
                    showMessage('Peer disconnected, attempting to reconnect...', 'warning');
                    break;
                case 'failed':
                    handleConnectionError();
                    break;
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection State:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                handleConnectionError();
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

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && peerConnection) {
        cleanup();
        showMessage('Call ended due to page becoming inactive', 'info');
    }
});

// Handle beforeunload to cleanup
window.addEventListener('beforeunload', cleanup);

// Initialize UI
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

    // Add tap-to-play handler for mobile browsers
    document.addEventListener('click', () => {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (video.paused) {
                video.play().catch(e => console.warn('Video play failed:', e));
            }
        });
    }, { once: true });
});