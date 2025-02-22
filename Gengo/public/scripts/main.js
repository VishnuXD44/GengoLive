import { startLocalStream, createPeerConnection, monitorConnectionQuality } from './webrtc.js';

// Socket.io initialization with better error handling
const socket = io(window.location.origin, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
});

// State management
const STATE = {
    IDLE: 'idle',
    WAITING: 'waiting',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    FAILED: 'failed'
};

let currentState = STATE.IDLE;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentRoom = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// UI Elements
const videoContainer = document.querySelector('.video-container');
const selectionContainer = document.querySelector('.selection-container');
const connectButton = document.getElementById('connect');
const leaveButton = document.getElementById('leave');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

function updateState(newState) {
    currentState = newState;
    document.body.setAttribute('data-state', newState);
    updateUI(newState);
}

function updateUI(state) {
    const roleElement = document.getElementById('role');
    const languageElement = document.getElementById('language');
    const role = roleElement ? roleElement.value : '';
    const language = languageElement ? languageElement.value : '';

    switch (state) {
        case STATE.WAITING:
            const roleSpecificMessage = role === 'practice'
                ? `Waiting for a ${language} language coach...`
                : `Waiting for a ${language} language practice partner...`;
            showMessage(roleSpecificMessage, 'info');
            
            if (connectButton) connectButton.style.display = 'none';
            if (leaveButton) leaveButton.style.display = 'block';
            
            // Add waiting indicator
            const waitingIndicator = document.createElement('div');
            waitingIndicator.className = 'waiting-indicator';
            waitingIndicator.innerHTML = `
                <div class="spinner"></div>
                <p>${roleSpecificMessage}</p>
                <p class="queue-position">Searching for a match...</p>
            `;
            if (videoContainer && !videoContainer.querySelector('.waiting-indicator')) {
                videoContainer.appendChild(waitingIndicator);
            }
            break;
            
        case STATE.CONNECTING:
            showMessage('Establishing connection...', 'info');
            if (videoContainer) {
                videoContainer.style.display = 'grid';
                const indicator = videoContainer.querySelector('.waiting-indicator');
                if (indicator) indicator.remove();
            }
            if (selectionContainer) selectionContainer.style.display = 'none';
            break;
            
        case STATE.CONNECTED:
            const connectedMessage = role === 'practice'
                ? 'Connected with your language coach'
                : 'Connected with your practice partner';
            showMessage(connectedMessage, 'success');
            
            if (videoContainer) {
                videoContainer.style.display = 'grid';
                const indicator = videoContainer.querySelector('.waiting-indicator');
                if (indicator) indicator.remove();
            }
            if (selectionContainer) selectionContainer.style.display = 'none';
            
            // Add role indicator
            const roleIndicator = document.createElement('div');
            roleIndicator.className = 'role-indicator';
            roleIndicator.textContent = role === 'practice' ? 'Student' : 'Coach';
            if (videoContainer && !videoContainer.querySelector('.role-indicator')) {
                videoContainer.appendChild(roleIndicator);
            }

            // Add connection quality indicator
            const qualityIndicator = document.createElement('div');
            qualityIndicator.className = 'connection-quality';
            qualityIndicator.innerHTML = '<span class="quality-dot"></span> Connection: Good';
            if (videoContainer && !videoContainer.querySelector('.connection-quality')) {
                videoContainer.appendChild(qualityIndicator);
            }
            break;
            
        case STATE.FAILED:
            showMessage('Connection failed. Please try again.', 'error');
            resetVideoCall();
            break;
            
        case STATE.IDLE:
        default:
            if (videoContainer) {
                videoContainer.style.display = 'none';
                const indicators = videoContainer.querySelectorAll('.waiting-indicator, .role-indicator, .connection-quality');
                indicators.forEach(indicator => indicator.remove());
            }
            if (selectionContainer) selectionContainer.style.display = 'flex';
            if (connectButton) {
                connectButton.style.display = 'block';
                connectButton.disabled = false;
            }
            if (leaveButton) leaveButton.style.display = 'none';
            break;
    }
}

async function initializeCall() {
    try {
        updateState(STATE.CONNECTING);
        localStream = await startLocalStream();
        
        if (!localStream) {
            throw new Error('Failed to get local stream');
        }

        // Fetch ICE servers with retry
        let iceServers;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch('/api/get-ice-servers');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                iceServers = await response.json();
                break;
            } catch (error) {
                console.warn(`ICE servers fetch attempt ${attempt} failed:`, error);
                if (attempt === 3) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const configuration = {
            iceServers,
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            sdpSemantics: 'unified-plan'
        };

        peerConnection = await createPeerConnection(configuration);
        
        // Monitor connection quality
        monitorConnectionQuality(peerConnection, (quality) => {
            const qualityIndicator = videoContainer.querySelector('.connection-quality');
            if (qualityIndicator) {
                const dot = qualityIndicator.querySelector('.quality-dot');
                dot.className = `quality-dot ${quality}`;
                qualityIndicator.innerHTML = `<span class="quality-dot ${quality}"></span> Connection: ${quality.charAt(0).toUpperCase() + quality.slice(1)}`;
            }
            // Notify server about quality changes
            if (currentRoom) {
                socket.emit('connection-quality', { room: currentRoom, quality });
            }
        });

        updateState(STATE.WAITING);
    } catch (error) {
        console.error('Call initialization failed:', error);
        showMessage(error.message, 'error');
        updateState(STATE.IDLE);
    }
}

function setupSocketListeners() {
    socket.on('match-found', async (data) => {
        currentRoom = data.room;
        console.log('Match found in room:', currentRoom);
        showMessage('Match found! Connecting...', 'info');

        try {
            const role = document.getElementById('role').value;
            if (role === 'practice') {
                await createAndSendOffer();
            }
            updateState(STATE.CONNECTING);
        } catch (error) {
            console.error('Error in match-found handler:', error);
            showMessage('Failed to establish connection', 'error');
            resetVideoCall();
        }
    });

    socket.on('offer', async (data) => {
        try {
            if (!peerConnection) {
                showMessage('Connection not initialized', 'error');
                return;
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { answer, room: currentRoom });
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Failed to process connection offer', 'error');
        }
    });

    socket.on('answer', async (data) => {
        try {
            if (!peerConnection) {
                showMessage('Connection not initialized', 'error');
                return;
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Failed to process connection answer', 'error');
        }
    });

    socket.on('ice-candidate', async (data) => {
        try {
            if (!peerConnection) return;
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.warn('Error handling ICE candidate:', error);
        }
    });

    socket.on('peer-disconnected', ({ reason, roomId }) => {
        showMessage('Your partner has disconnected', 'warning');
        resetVideoCall();
    });

    socket.on('peer-connection-quality', ({ quality }) => {
        const qualityIndicator = videoContainer.querySelector('.connection-quality');
        if (qualityIndicator) {
            qualityIndicator.innerHTML = `<span class="quality-dot ${quality}"></span> Partner's Connection: ${quality.charAt(0).toUpperCase() + quality.slice(1)}`;
        }
    });

    socket.on('queue-timeout', () => {
        showMessage('Queue timeout. Please try again.', 'warning');
        resetVideoCall();
    });

    socket.on('room-timeout', () => {
        showMessage('Session timeout. Please reconnect.', 'warning');
        resetVideoCall();
    });

    socket.on('waiting', (data) => {
        const queuePosition = videoContainer.querySelector('.queue-position');
        if (queuePosition) {
            queuePosition.textContent = `Queue position: ${data.position}`;
            if (data.estimatedWait) {
                queuePosition.textContent += ` (Est. wait: ${Math.ceil(data.estimatedWait / 60)} min)`;
            }
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        showMessage('Connection to server failed', 'error');
        updateState(STATE.FAILED);
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        showMessage('Disconnected from server', 'warning');
        resetVideoCall();
    });
}

async function createAndSendOffer() {
    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { offer, room: currentRoom });
    } catch (error) {
        console.error('Error creating/sending offer:', error);
        showMessage('Failed to create connection offer', 'error');
        throw error;
    }
}

function resetVideoCall() {
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

    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    currentRoom = null;
    updateState(STATE.IDLE);
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 5000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            try {
                connectButton.disabled = true;
                connectButton.classList.add('loading');
                
                const language = document.getElementById('language').value;
                const role = document.getElementById('role').value;

                await initializeCall();
                socket.emit('join', { language, role });
                
            } catch (error) {
                console.error('Error initializing call:', error);
                showMessage(error.message, 'error');
                resetVideoCall();
            } finally {
                connectButton.classList.remove('loading');
            }
        });
    }

    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            resetVideoCall();
            showMessage('Disconnected', 'info');
        });
    }
});

// Initialize socket listeners
setupSocketListeners();