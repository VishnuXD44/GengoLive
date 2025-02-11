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

async function startLocalStream() {
    try {
        // Check permissions first
        const hasPermissions = await checkMediaPermissions();
        if (!hasPermissions) {
            throw new Error('Permission check failed');
        }

        // Basic constraints first
        const constraints = {
            video: true,
            audio: {
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true }
            }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Now try to upgrade video quality if possible
            const betterConstraints = {
                video: {
                    width: { min: 320, ideal: 1280, max: 1920 },
                    height: { min: 240, ideal: 720, max: 1080 },
                    frameRate: { min: 15, ideal: 30 },
                    facingMode: 'user'
                }
            };
            
            const betterStream = await navigator.mediaDevices.getUserMedia(betterConstraints);
            localStream.getVideoTracks().forEach(track => track.stop());
            localStream.removeTrack(localStream.getVideoTracks()[0]);
            localStream.addTrack(betterStream.getVideoTracks()[0]);
        } catch (e) {
            console.log('Using basic video constraints');
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.setAttribute('playsinline', '');
            localVideo.setAttribute('webkit-playsinline', '');
            localVideo.muted = true;

            // Create play button for manual start
            const playButton = document.createElement('button');
            playButton.textContent = 'Start Video';
            playButton.className = 'play-button';
            localVideo.parentElement.appendChild(playButton);

            // Try autoplay first
            try {
                await localVideo.play();
                playButton.remove();
            } catch (e) {
                console.warn('Autoplay failed:', e);
                playButton.onclick = async () => {
                    try {
                        await localVideo.play();
                        playButton.remove();
                    } catch (err) {
                        console.error('Manual play failed:', err);
                    }
                };
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

// Socket initialization with proper error handling
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
            extraHeaders: {} // Remove User-Agent header
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

// Better video handling
async function handleVideoStream(video, stream, isLocal = false) {
    if (!video || !stream) return;

    try {
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.muted = isLocal; // Mute only local video

        // Create container for play button
        const videoWrapper = video.parentElement;
        videoWrapper.classList.add('video-wrapper');

        // Handle autoplay
        try {
            await video.play();
        } catch (e) {
            console.warn(`${isLocal ? 'Local' : 'Remote'} video autoplay failed:`, e);
            
            // Add play button if not exists
            if (!videoWrapper.querySelector('.play-button')) {
                const playButton = document.createElement('button');
                playButton.textContent = 'Click to Start Video';
                playButton.className = 'play-button';
                videoWrapper.appendChild(playButton);
                
                playButton.onclick = async () => {
                    try {
                        await video.play();
                        playButton.remove();
                    } catch (err) {
                        console.error('Manual play failed:', err);
                        showMessage('Video playback failed. Please refresh the page.', 'error');
                    }
                };
            }
        }
    } catch (err) {
        console.error('Error setting up video:', err);
        showMessage('Failed to setup video stream', 'error');
    }
}

// Update your existing startLocalStream function
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
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true }
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

// Rest of your existing code remains the same

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