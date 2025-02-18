let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null;
let currentRoom = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

const configuration = {
    iceServers: [
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'relay',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan'
};

// Video handling functions
async function playVideo(videoElement) {
    if (!videoElement.srcObject) return;
    
    try {
        if (videoElement.readyState < 2) {
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => resolve();
            });
        }
        
        if (videoElement.id === 'localVideo') {
            videoElement.muted = true;
        }
        
        await videoElement.play();
    } catch (error) {
        console.warn('Video play error:', error);
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
                socket.emit('candidate', event.candidate, currentRoom);
            }
        };

        peerConnection.ontrack = async (event) => {
            console.log('Received remote track:', event.track.kind);
            if (event.streams && event.streams[0]) {
                console.log('Setting remote stream from ontrack');
                remoteStream = event.streams[0];
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo && remoteVideo.srcObject !== event.streams[0]) {
                    remoteVideo.srcObject = event.streams[0];
                    await handleRemoteStream(remoteStream);
                }
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                socket.emit('connection-status', { room: currentRoom, status: 'connected' });
                showMessage('Peer connection established', 'info');
            } else if (peerConnection.connectionState === 'failed') {
                handleDisconnection();
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'disconnected') {
                showMessage('Connection unstable', 'warning');
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Start monitoring connection quality
        setInterval(monitorConnectionQuality, 5000);

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw error;
    }
}

// Socket handling
function initializeSocket() {
    try {
        socket = io('https://gengolive-f8fb09d3fdf5.herokuapp.com', {
            path: '/socket.io/',
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            socket.emit('join', { language, role });
            showMessage(`Looking for a ${role === 'practice' ? 'coach' : 'practice partner'}...`, 'info');
        });

        setupSocketListeners();
    } catch (error) {
        console.error('Socket initialization error:', error);
        showMessage('Failed to connect to server', 'error');
        resetVideoCall();
    }
}

function setupSocketListeners() {
    socket.on('match', async (data) => {
        try {
            currentRoom = data.room;
            console.log(`Matched in room: ${currentRoom}, role: ${data.role}`);
            showMessage(`Found a ${data.role === 'practice' ? 'coach' : 'practice partner'}!`, 'info');
            
            peerConnection = await createPeerConnection();
            
            if (data.offer) {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit('offer', offer, currentRoom);
            }
        } catch (error) {
            console.error('Error handling match:', error);
            showMessage('Failed to create connection', 'error');
        }
    });

    socket.on('waiting', (data) => {
        showMessage(`Waiting for a ${data.role === 'practice' ? 'coach' : 'practice partner'} who speaks ${data.language}...`, 'info');
    });

    socket.on('offer', async (offer) => {
        try {
            if (!peerConnection) {
                peerConnection = await createPeerConnection();
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer, currentRoom);
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Failed to process offer', 'error');
        }
    });

    socket.on('answer', async (answer) => {
        try {
            if (peerConnection.signalingState !== 'stable') {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Failed to process answer', 'error');
        }
    });

    socket.on('candidate', async (candidate) => {
        try {
            if (peerConnection && peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    });

    socket.on('user-disconnected', () => {
        showMessage('Other user disconnected', 'info');
        resetVideoCall();
    });

    socket.on('disconnect', () => {
        handleDisconnection();
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

        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        document.querySelector('.video-container').style.display = 'grid';
        document.querySelector('.selection-container').style.display = 'none';
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            await playVideo(localVideo);
        }

        connectBtn.style.display = 'none';
        document.getElementById('leave').style.display = 'block';

        await initializeSocket();

    } catch (error) {
        console.error('Error starting call:', error);
        showMessage('Failed to access media devices', 'error');
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
    try {
        console.log('Handling remote stream:', stream.id);
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            if (!remoteVideo.srcObject) {
                remoteVideo.srcObject = stream;
                await playVideo(remoteVideo);
                addVideoFallback(remoteVideo);
                showMessage('Connected to remote user', 'info');
            }
        } else {
            console.error('Remote video element not found');
            showMessage('Error: Remote video element not found', 'error');
        }
    } catch (error) {
        console.error('Error handling remote stream:', error);
        showMessage('Failed to display remote video', 'error');
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
