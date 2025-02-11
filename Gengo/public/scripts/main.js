import io from 'socket.io-client';
import { configuration } from '../../src/utils/webrtc.js';

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null;
let currentRoom = null;

// Add permission check function
async function checkMediaPermissions() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support media devices');
        }

        // Request permissions explicitly
        const permissions = await Promise.all([
            navigator.permissions.query({ name: 'camera' }),
            navigator.permissions.query({ name: 'microphone' })
        ]);

        if (permissions.some(p => p.state === 'denied')) {
            throw new Error('Camera/Microphone access denied');
        }

        return true;
    } catch (error) {
        console.error('Permission check failed:', error);
        showMessage(error.message, 'error');
        return false;
    }
}

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

// Modified video handling function
async function handleVideoStream(video, stream, isLocal = false) {
    if (!video || !stream) return;

    try {
        // Create new MediaStream to avoid interruption issues
        const newStream = new MediaStream(stream.getTracks());
        video.srcObject = newStream;
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.muted = isLocal;

        const videoWrapper = video.parentElement;
        videoWrapper.classList.add('video-wrapper');

        // Improved autoplay handling
        const playVideo = async () => {
            try {
                // Only play if video is paused
                if (video.paused) {
                    await video.play();
                }
            } catch (err) {
                console.warn(`${isLocal ? 'Local' : 'Remote'} video autoplay failed:`, err);
                
                if (!videoWrapper.querySelector('.play-button')) {
                    const playButton = document.createElement('button');
                    playButton.textContent = 'Click to Start Video';
                    playButton.className = 'play-button';
                    videoWrapper.appendChild(playButton);
                    
                    playButton.onclick = async () => {
                        try {
                            await video.play();
                            playButton.remove();
                        } catch (playErr) {
                            console.error('Manual play failed:', playErr);
                            showMessage('Video playback failed. Please refresh.', 'error');
                        }
                    };
                }
            }
        };

        // Add multiple triggers for play attempts
        video.addEventListener('loadedmetadata', playVideo);
        video.addEventListener('canplay', playVideo);
        document.addEventListener('click', playVideo, { once: true });
    } catch (err) {
        console.error('Error setting up video:', err);
        showMessage('Failed to setup video stream', 'error');
    }
}

// Improved socket initialization
function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        const socketUrl = 'https://gengolive-production.up.railway.app';

        const socketIo = io(socketUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000,
            withCredentials: false,
            forceNew: true,
            secure: true,
            autoConnect: true,
            extraHeaders: undefined // Ensure no unsafe headers are set
        });

        socketIo.on('connect', () => {
            console.log('Successfully connected to socket server');
            showMessage('Connected to server', 'success');
        });

        socketIo.on('connect_error', (error) => {
            console.error('Connection error:', error);
            if (error.message.includes('websocket error')) {
                console.log('Falling back to polling transport');
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

// Modified startLocalStream with better error handling
async function startLocalStream() {
    try {
        const hasPermissions = await checkMediaPermissions();
        if (!hasPermissions) {
            throw new Error('Permission check failed');
        }

        const constraints = {
            video: {
                width: { min: 320, ideal: 1280, max: 1920 },
                height: { min: 240, ideal: 720, max: 1080 },
                facingMode: 'user',
                frameRate: { min: 15, ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            console.log('Falling back to basic constraints');
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            await handleVideoStream(localVideo, localStream, true);
        }

        return localStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        handleMediaError();
        throw err;
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
                handleVideoStream(remoteVideo, event.streams[0], false);
                remoteStream = event.streams[0];
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

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', event.candidate);
            }
        };

        return peerConnection;
    } catch (error) {
        console.error('Error initializing peer connection:', error);
        handleConnectionError();
        throw error;
    }
}

function cleanup() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (socket) {
        socket.disconnect();
        socket = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }

    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
        videoContainer.style.display = 'none';
    }

    const selectionContainer = document.getElementById('selection-container');
    if (selectionContainer) {
        selectionContainer.style.display = 'flex';
    }
}

async function startCall() {
    try {
        console.log('Starting call process');
        
        // Cleanup any existing connections first
        cleanup();
        
        // Create loading state
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'video-loading';
            videoContainer.appendChild(loadingDiv);
        }

        await startLocalStream();
        
        socket = initializeSocket();
        if (!socket) throw new Error('Failed to initialize socket');
        
        peerConnection = await initializePeerConnection();
        if (!peerConnection) throw new Error('Failed to initialize peer connection');
        
        // Remove loading state
        const loadingDiv = document.querySelector('.video-loading');
        if (loadingDiv) loadingDiv.remove();
        
        // Show video container and hide selection container
        if (videoContainer) videoContainer.style.display = 'block';
        const selectionContainer = document.getElementById('selection-container');
        if (selectionContainer) selectionContainer.style.display = 'none';

        showMessage('Connecting...', 'info');
    } catch (error) {
        console.error('Error starting call:', error);
        handleConnectionError();
    }
}

document.getElementById('connect').addEventListener('click', startCall);