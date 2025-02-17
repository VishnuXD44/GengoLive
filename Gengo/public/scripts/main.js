let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null;
let currentRoom = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

if (isMobile) {
    // Add mobile-specific event handlers
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Page is hidden (app in background)
            if (localStream) {
                localStream.getTracks().forEach(track => track.enabled = false);
            }
        } else {
            // Page is visible again
            if (localStream) {
                localStream.getTracks().forEach(track => track.enabled = true);
            }
        }
    });
}

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan',
    iceCandidatePoolSize: 10
};

// Video handling functions
async function playVideo(videoElement) {
    if (!videoElement.srcObject) return;
    
    try {
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        
        if (videoElement.readyState < 2) {
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => resolve();
            });
        }
        
        if (videoElement.id === 'localVideo') {
            videoElement.muted = true;
        }
        
        const playPromise = videoElement.play();
        if (playPromise !== undefined) {
            await playPromise;
        }
    } catch (error) {
        console.warn('Video play error:', error);
        if (error.name === 'NotAllowedError') {
            showMessage('Please allow autoplay for this site', 'warning');
        }
        addPlayButton(videoElement);
    }
}

function addPlayButton(videoElement) {
    const wrapper = videoElement.parentElement;
    const existingButton = wrapper.querySelector('.play-button');
    if (existingButton) existingButton.remove();

    const playButton = document.createElement('button');
    playButton.className = 'play-button';
    playButton.innerHTML = '▶';
    wrapper.appendChild(playButton);

    playButton.onclick = async () => {
        try {
            await videoElement.play();
            playButton.remove();
        } catch (error) {
            console.error('Play failed:', error);
            showMessage('Failed to play video', 'error');
        }
    };
}

// Media and Connection handling
async function checkMediaPermissions() {
    try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        return true;
    } catch (error) {
        console.error('Permission check error:', error);
        return false;
    }
}

async function setVideoQuality(quality = 'medium') {
    const qualities = {
        low: { width: 320, height: 240, frameRate: 15 },
        medium: { width: 640, height: 480, frameRate: 30 },
        high: { width: 1280, height: 720, frameRate: 30 }
    };

    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            await videoTrack.applyConstraints({
                width: { ideal: qualities[quality].width },
                height: { ideal: qualities[quality].height },
                frameRate: { ideal: qualities[quality].frameRate }
            });
        }
    }
}

async function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && currentRoom) {
                console.log('Sending ICE candidate');
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    room: currentRoom
                });
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                handleDisconnection();
            }
        };

        peerConnection.ontrack = async (event) => {
            console.log('Received remote track:', event.track.kind);
            if (event.streams && event.streams[0]) {
                console.log('Setting remote stream from ontrack');
                const stream = event.streams[0];
                
                // Wait for both audio and video tracks before handling
                const tracks = stream.getTracks();
                const hasAudio = tracks.some(track => track.kind === 'audio');
                const hasVideo = tracks.some(track => track.kind === 'video');
                
                if (hasAudio && hasVideo) {
                    console.log('Both audio and video tracks available');
                    remoteStream = stream;
                    await handleRemoteStream(remoteStream);
                } else {
                    console.log('Waiting for both tracks. Current tracks:',
                        tracks.map(t => t.kind).join(', '));
                }
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log('Adding local track:', track.kind);
                peerConnection.addTrack(track, localStream);
            });
        }

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw error;
    }
}

function initializeSocket() {
    try {
        const language = document.getElementById('language').value;
        const role = document.getElementById('role').value;

        if (!language || !role) {
            showMessage('Please select both language and role', 'error');
            return;
        }

        socket = io('https://gengolive-f8fb09d3fdf5.herokuapp.com', {
            path: '/socket.io/',
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5
        });

        socket.on('connect', () => {
            console.log('Connected to server with role:', role, 'language:', language);
            socket.emit('join', { language, role });
            showMessage(`Looking for a ${role === 'practice' ? 'coach' : 'practice partner'} for ${language}...`, 'info');
        });

        setupSocketListeners();
    } catch (error) {
        console.error('Socket initialization error:', error);
        showMessage('Failed to connect to server', 'error');
        resetVideoCall();
    }
}


function setupSocketListeners() {
    socket.on('match-found', async (data) => {
        console.log('Match found in room:', data.room, 'Role:', data.role);
        currentRoom = data.room;
        
        try {
            // Only the practice user initiates the offer
            if (document.getElementById('role').value === 'practice') {
                console.log('Creating peer connection as practice user');
                peerConnection = await createPeerConnection();
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit('offer', { offer, room: currentRoom });
            }
        } catch (error) {
            console.error('Error creating offer:', error);
            showMessage('Failed to create connection', 'error');
        }
    });

    socket.on('offer', async (data) => {
        console.log('Received offer from peer in room:', data.room);
        currentRoom = data.room;
        
        try {
            if (document.getElementById('role').value === 'coach') {
                console.log('Creating peer connection as coach');
                peerConnection = await createPeerConnection();
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('answer', { answer, room: currentRoom });
            }
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    });

    socket.on('answer', async (data) => {
        console.log('Received answer in room:', data.room);
        try {
            if (peerConnection && document.getElementById('role').value === 'practice') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('Remote description set successfully');
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    });

    socket.on('ice-candidate', async (data) => {
        console.log('Received ICE candidate for room:', data.room);
        try {
            if (peerConnection && currentRoom === data.room) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('Added ICE candidate successfully');
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    });

    socket.on('user-disconnected', () => {
        showMessage('Other user disconnected', 'info');
        resetVideoCall();
    });

    socket.on('match-error', (error) => {
        showMessage(error.message || 'Failed to find a match', 'error');
        resetVideoCall();
    });
}


// Call handling
async function startCall() {
    try {
        const connectBtn = document.getElementById('connect');
        connectBtn.disabled = true;
        connectBtn.classList.add('loading');

        const hasPermissions = await checkMediaPermissions();
        if (!hasPermissions) {
            showMessage('Camera and microphone access required', 'error');
            connectBtn.disabled = false;
            connectBtn.classList.remove('loading');
            return;
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    frameRate: { max: 30 },
                    facingMode: 'user' // This ensures front camera on mobile
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000,
                    sampleSize: 16
                }
            });
        } catch (mediaError) {
            // Try fallback to basic constraints if initial attempt fails
            if (mediaError.name === 'NotReadableError') {
                console.log('Attempting fallback media constraints...');
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
            } else {
                throw mediaError;
            }
        }

        document.querySelector('.video-container').style.display = 'grid';
        document.querySelector('.selection-container').style.display = 'none';
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.setAttribute('playsinline', ''); // Important for iOS
            await playVideo(localVideo);
        }

        connectBtn.style.display = 'none';
        document.getElementById('leave').style.display = 'block';

        await initializeSocket();

    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access media devices. Please check camera permissions.', 'error');
        resetVideoCall();
    }
}

function resetVideoCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (socket) {
        socket.disconnect();
    }

    localStream = null;
    remoteStream = null;
    currentRoom = null;

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    document.querySelector('.video-container').style.display = 'none';
    document.querySelector('.selection-container').style.display = 'flex';
    document.getElementById('connect').style.display = 'block';
    document.getElementById('connect').disabled = false;
    document.getElementById('connect').classList.remove('loading');
    document.getElementById('leave').style.display = 'none';
}

function leaveCall() {
    resetVideoCall();
    showMessage('Call ended', 'info');
}

function handleDisconnection() {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        showMessage("Connection lost, attempting to reconnect...", "info");
        reconnectAttempts++;
        setTimeout(() => {
            resetVideoCall();
            startCall();
        }, 2000);
    } else {
        showMessage("Unable to reconnect. Please try again later.", "error");
        resetVideoCall();
    }
}

// Utility functions
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 5000);
}

function monitorConnectionQuality() {
    if (peerConnection) {
        peerConnection.getStats(null).then(stats => {
            stats.forEach(report => {
                if (report.type === "inbound-rtp" && report.kind === "video") {
                    if (report.packetsLost > 100) {
                        showMessage("Poor connection quality", "warning");
                    }
                }
            });
        });
    }
}

async function setBandwidthConstraints(sdp) {
    const videoBandwidth = 1000;
    const audioBandwidth = 50;

    const sdpLines = sdp.split('\r\n');
    const mediaLines = sdpLines.map((line, index) => {
        if (line.startsWith('m=video')) {
            sdpLines.splice(index + 1, 0, `b=AS:${videoBandwidth}`);
        }
        if (line.startsWith('m=audio')) {
            sdpLines.splice(index + 1, 0, `b=AS:${audioBandwidth}`);
        }
        return line;
    });

    return mediaLines.join('\r\n');
}

function addVideoFallback(videoElement) {
    videoElement.addEventListener('loadedmetadata', async () => {
        try {
            if (videoElement.paused) {
                await videoElement.play();
            }
        } catch (error) {
            console.warn('Playback failed:', error);
            addPlayButton(videoElement);
        }
    });
}

async function handleRemoteStream(stream) {
    console.log('Handling remote stream:', stream.id);
    console.log('Stream tracks:', stream.getTracks());
    
    const remoteVideo = document.getElementById('remoteVideo');
    if (!remoteVideo) {
        console.error('Remote video element not found');
        return;
    }
    
    console.log('playing remote video:', videoElement.id);
    console.log('Video readyState:', videoElement.readyState);
    console.log('Video tracks:', videoElement.srcObject.getVideoTracks());
    remoteVideo.srcObject = stream;
    
    // Add these attributes to help with autoplay
    remoteVideo.setAttribute('playsinline', '');
    remoteVideo.setAttribute('webkit-playsinline', '');
    
    try {
        await playVideo(remoteVideo);
    } catch (error) {
        console.error('Error playing remote video:', error);
        console.log('Video element state:', {
            paused: videoElement.paused,
            currentTime: videoElement.currentTime,
            duration: videoElement.duration,
            readyState: videoElement.readyState
        });
        if (error.name === 'NotAllowedError') {
            showMessage('Please allow autoplay for this site', 'warning');
        }
        addPlayButton(remoteVideo);
    }
}


// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    
    if (connectButton) {
        connectButton.addEventListener('click', startCall);
    }
    if (leaveButton) {
        leaveButton.addEventListener('click', leaveCall);
    }
});

// Export functions for external use
window.startCall = startCall;
window.leaveCall = leaveCall;
window.setVideoQuality = setVideoQuality;