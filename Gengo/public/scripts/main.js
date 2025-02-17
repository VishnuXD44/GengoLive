// ============ GLOBAL VARIABLES AND CONFIGURATION ============
let localStream;
let remoteStream;
let peerConnection;
let socket;
let currentRoom;
let iceCandidatesQueue = [];

const configuration = {
    iceServers: [
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ]
        }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// ============ DEBUG UTILITIES ============
function debugVideoState(videoElement, label = 'Video state') {
    if (!videoElement) {
        console.error(`${label}: Video element not found`);
        return;
    }

    console.log(label, {
        srcObject: !!videoElement.srcObject,
        tracks: videoElement.srcObject?.getTracks().map(t => ({
            kind: t.kind,
            readyState: t.readyState,
            enabled: t.enabled,
            muted: t.muted
        })),
        readyState: videoElement.readyState,
        paused: videoElement.paused,
        currentTime: videoElement.currentTime,
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight,
        style: {
            display: videoElement.style.display,
            width: videoElement.style.width,
            height: videoElement.style.height
        }
    });
}

// ============ WEBRTC CONNECTION FUNCTIONS ============
async function createPeerConnection() {
    if (peerConnection) {
        console.log('Closing existing peer connection');
        peerConnection.close();
        peerConnection = null;
    }

    try {
        peerConnection = new RTCPeerConnection(configuration);
        console.log('Created new peer connection');

        // Add local tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log('Added local track:', track.kind);
            });
        }

        peerConnection.ontrack = handleTrackEvent;
        peerConnection.onicecandidate = handleICECandidate;
        peerConnection.oniceconnectionstatechange = handleICEConnectionStateChange;
        peerConnection.onconnectionstatechange = handleConnectionStateChange;

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        showMessage('Error creating connection', 'error');
        throw error;
    }
}

function handleTrackEvent(event) {
    console.log('Received remote track:', event.track.kind);
    const remoteVideo = document.getElementById('remoteVideo');
    if (!remoteVideo) {
        console.error('Remote video element not found');
        return;
    }

    // Initialize remote stream if needed
    if (!remoteVideo.srcObject) {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
        console.log('Created new MediaStream for remote video');
    }

    // Remove any existing tracks of the same kind
    const existingTracks = remoteStream.getTracks().filter(track => track.kind === event.track.kind);
    existingTracks.forEach(track => {
        remoteStream.removeTrack(track);
        console.log(`Removed existing ${track.kind} track`);
    });

    // Add the new track
    remoteStream.addTrack(event.track);
    console.log(`Added new ${event.track.kind} track to remote stream`);

    // Configure video element
    remoteVideo.setAttribute('playsinline', '');
    remoteVideo.muted = true;
    
    // Ensure proper styling
    remoteVideo.style.display = 'block';
    remoteVideo.style.width = '100%';
    remoteVideo.style.height = 'auto';

    // Debug track state
    console.log('Track details:', {
        trackId: event.track.id,
        kind: event.track.kind,
        enabled: event.track.enabled,
        readyState: event.track.readyState
    });

    // Track ended handler
    event.track.onended = () => {
        console.log(`Remote ${event.track.kind} track ended`);
        showMessage(`Remote ${event.track.kind} disconnected`, 'warning');
    };

    // Attempt playback when both tracks are present
    const hasAudioTrack = remoteStream.getAudioTracks().length > 0;
    const hasVideoTrack = remoteStream.getVideoTracks().length > 0;
    
    if (hasAudioTrack && hasVideoTrack) {
        console.log('Both tracks received, attempting playback');
        attemptPlayback(remoteVideo);
    }
}

async function attemptPlayback(videoElement) {
    try {
        // Wait for metadata
        if (videoElement.readyState < 2) {
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => resolve();
                // Add timeout to prevent hanging
                setTimeout(resolve, 5000);
            });
        }

        await videoElement.play();
        videoElement.muted = false;
        console.log('Video playing successfully');
        debugVideoState(videoElement, 'Playback started');
    } catch (error) {
        console.warn('Playback failed:', error);
        handlePlaybackError(videoElement);
    }
}

function handlePlaybackError(videoElement) {
    const container = videoElement.parentElement;
    
    // Remove any existing play buttons
    const existingButton = container.querySelector('.play-button');
    if (existingButton) {
        existingButton.remove();
    }

    // Create new play button
    const playButton = document.createElement('button');
    playButton.textContent = 'Click to play video';
    playButton.className = 'play-button';
    playButton.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000;';
    
    playButton.onclick = async () => {
        try {
            await videoElement.play();
            videoElement.muted = false;
            playButton.remove();
            console.log('Playback started via user interaction');
        } catch (err) {
            console.error('Playback failed even with user interaction:', err);
            showMessage('Failed to start video playback', 'error');
        }
    };

    container.appendChild(playButton);
}

function handleICECandidate(event) {
    if (event.candidate && currentRoom) {
        console.log('Sending ICE candidate:', event.candidate.type);
        socket.emit('candidate', event.candidate, currentRoom);
    }
}

function handleICEConnectionStateChange() {
    console.log('ICE connection state:', peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === 'failed') {
        console.log('ICE Failed - Attempting restart');
        peerConnection.restartIce();
        showMessage('Connection issues detected, attempting to reconnect', 'warning');
    }
}

function handleConnectionStateChange() {
    console.log('Connection state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'failed') {
        console.log('Peer connection failed - Resetting');
        showMessage('Connection lost, please try again', 'error');
        resetVideoCall();
    }
}

// ============ SOCKET COMMUNICATION FUNCTIONS ============
function initializeSocket() {
    try {
        socket = io(window.location.origin, {
            path: '/socket.io/',
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            socket.emit('join', { language, role });
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            showMessage('Connection to server failed', 'error');
        });

        setupSocketListeners();
    } catch (error) {
        console.error('Socket initialization error:', error);
        showMessage('Failed to connect to server', 'error');
        resetVideoCall();
    }
}

function setupSocketListeners() {
    socket.on('match', async ({ offer, room }) => {
        console.log(`Matched in room: ${room}, initiating offer: ${offer}`);
        currentRoom = room;
        showMessage('Connected to peer', 'success');

        try {
            await createPeerConnection();
            
            if (offer) {
                const offerDescription = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offerDescription);
                socket.emit('offer', offerDescription, room);
                console.log('Sent offer');
            }
        } catch (error) {
            console.error('Error in match handler:', error);
            showMessage('Connection error', 'error');
        }
    });

    socket.on('offer', async (offer) => {
        try {
            if (!peerConnection) {
                await createPeerConnection();
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Process queued candidates
            while (iceCandidatesQueue.length > 0) {
                const candidate = iceCandidatesQueue.shift();
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer, currentRoom);
            console.log('Sent answer');
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Error handling offer', 'error');
        }
    });

    socket.on('answer', async (answer) => {
        try {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Set remote description from answer');
            }
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Error handling answer', 'error');
        }
    });

    socket.on('candidate', async (candidate) => {
        try {
            if (peerConnection && peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added ICE candidate');
            } else {
                iceCandidatesQueue.push(candidate);
                console.log('Queued ICE candidate');
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    });

    socket.on('user-disconnected', () => {
        showMessage('Peer disconnected', 'info');
        resetVideoCall();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showMessage('Disconnected from server', 'warning');
        resetVideoCall();
    });
}

// ============ CALL MANAGEMENT FUNCTIONS ============
async function checkMediaPermissions() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Media devices not supported');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('Permission check error:', error);
        showMessage('Camera and microphone access required', 'error');
        return false;
    }
}

async function startCall() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Media devices not supported');
        }

        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: {
                facingMode: 'user',
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 }
            }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (mediaError) {
            console.warn('Failed with ideal constraints, trying basic setup:', mediaError);
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.setAttribute('playsinline', '');
            
            try {
                await attemptPlayback(localVideo);
            } catch (playError) {
                console.warn('Local video play failed:', playError);
                // Retry once after a short delay
                setTimeout(() => attemptPlayback(localVideo), 1000);
            }
        }

        // Update UI
        updateUIForCall(true);

        // Initialize connection
        await initializeSocket();
    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access camera and microphone', 'error');
        resetVideoCall();
    }
}

function updateUIForCall(starting) {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    const selectionContainer = document.querySelector('.selection-container');
    const videoContainer = document.querySelector('.video-container');

    if (starting) {
        connectButton.style.display = 'none';
        leaveButton.style.display = 'block';
        selectionContainer.style.display = 'none';
        videoContainer.style.display = 'grid';
    } else {
        connectButton.style.display = 'block';
        leaveButton.style.display = 'none';
        selectionContainer.style.display = 'flex';
        videoContainer.style.display = 'none';
    }
}

function resetVideoCall() {
    // Stop all tracks
    [localStream, remoteStream].forEach(stream => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    });

    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Disconnect socket
    if (socket) {
        socket.disconnect();
    }

    // Clear video elements
    ['localVideo', 'remoteVideo'].forEach(id => {
        const video = document.getElementById(id);
        if (video) {
            video.srcObject = null;
            video.style.display = 'block';
        }
    });

    // Reset variables
    localStream = null;
    remoteStream = null;
    currentRoom = null;
    iceCandidatesQueue = [];

    // Update UI
    updateUIForCall(false);
}

function leaveCall() {
    resetVideoCall();
    showMessage('Call ended', 'info');
}

// ============ UI FUNCTIONS ============
function showMessage(message, type = 'info') {
    // Remove any existing messages of the same type
    const existingMessages = document.querySelectorAll(`.message.${type}-message`);
    existingMessages.forEach(msg => msg.remove());

    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    
    // Style the message based on type
    const styles = {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 20px',
        borderRadius: '5px',
        zIndex: '1000',
        animation: 'fadeIn 0.3s ease-in-out'
    };

    // Add type-specific styles
    switch (type) {
        case 'error':
            styles.backgroundColor = '#ff4444';
            styles.color = 'white';
            break;
        case 'success':
            styles.backgroundColor = '#00C851';
            styles.color = 'white';
            break;
        case 'warning':
            styles.backgroundColor = '#ffbb33';
            styles.color = 'black';
            break;
        default:
            styles.backgroundColor = '#33b5e5';
            styles.color = 'white';
    }

    // Apply styles
    Object.assign(messageDiv.style, styles);

    // Add to document
    document.body.appendChild(messageDiv);

    // Remove after delay
    setTimeout(() => {
        messageDiv.style.animation = 'fadeOut 0.3s ease-in-out';
        setTimeout(() => messageDiv.remove(), 300);
    }, 5000);
}

// Add necessary CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
    }
    @keyframes fadeOut {
        from { opacity: 1; transform: translate(-50%, 0); }
        to { opacity: 0; transform: translate(-50%, -20px); }
    }
    .video-container {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        padding: 20px;
        position: relative;
    }
    .video-wrapper {
        position: relative;
        width: 100%;
        padding-top: 56.25%; /* 16:9 Aspect Ratio */
    }
    .video-wrapper video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #000;
        border-radius: 8px;
    }
    .controls {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        background: rgba(0, 0, 0, 0.5);
        padding: 10px;
        border-radius: 8px;
        z-index: 1000;
    }
`;
document.head.appendChild(style);

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI elements
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    
    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            connectButton.disabled = true;
            try {
                const hasPermissions = await checkMediaPermissions();
                if (hasPermissions) {
                    await startCall();
                }
            } catch (error) {
                console.error('Failed to start call:', error);
                showMessage('Failed to start call', 'error');
            } finally {
                connectButton.disabled = false;
            }
        });
    }
    
    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            leaveButton.disabled = true;
            try {
                leaveCall();
            } finally {
                leaveButton.disabled = false;
            }
        });
        leaveButton.style.display = 'none';
    }

    // Add window beforeunload handler
    window.addEventListener('beforeunload', () => {
        resetVideoCall();
    });

    // Add visibility change handler
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && peerConnection) {
            console.log('Page hidden, checking connection status');
            if (peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'failed') {
                console.log('Connection appears to be broken, resetting');
                resetVideoCall();
            }
        }
    });

    // Add resize handler for mobile orientation changes
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                if (video.srcObject) {
                    debugVideoState(video, `Resize check - ${video.id}`);
                }
            });
        }, 500);
    });
});

// Export necessary functions if using as a module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        startCall,
        leaveCall,
        resetVideoCall,
        showMessage
    };
}