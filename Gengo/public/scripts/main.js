import { startLocalStream } from '../../src/utils/webrtc.js';

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
    
    // Update role attribute when state changes
    const roleElement = document.getElementById('role');
    if (roleElement) {
        document.body.setAttribute('data-role', roleElement.value);
    }
    
    updateUI(newState);
}
function updateUI(state) {
    const roleElement = document.getElementById('role');
    const languageElement = document.getElementById('language');
    const role = roleElement ? roleElement.value : '';
    const language = languageElement ? languageElement.value : '';

    // Update role attribute
    if (role) {
        document.body.setAttribute('data-role', role);
    }

    // Add indicators to video container when it's visible
    if (videoContainer && videoContainer.style.display !== 'none') {
        // Add connection quality indicator if not present
        if (!videoContainer.querySelector('.connection-quality')) {
            const qualityIndicator = document.createElement('div');
            qualityIndicator.className = 'connection-quality';
            qualityIndicator.innerHTML = '<span class="quality-dot"></span> Connection: Unknown';
            videoContainer.appendChild(qualityIndicator);
        }

        // Add role indicator if not present
        if (!videoContainer.querySelector('.role-indicator')) {
            const roleIndicator = document.createElement('div');
            roleIndicator.className = 'role-indicator';
            roleIndicator.textContent = role === 'practice' ? 'Student' : 'Coach';
            videoContainer.appendChild(roleIndicator);
        }
    }

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

        // Create peer connection
        peerConnection = new RTCPeerConnection(configuration);

        // Add local stream tracks to peer connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Monitor connection quality
        window._qualityMonitorInterval = setInterval(() => {
            if (peerConnection && peerConnection.connectionState === 'connected') {
                peerConnection.getStats().then(stats => {
                    console.log('Monitoring connection quality...');
                    let totalPacketsLost = 0;
                    let totalPackets = 0;
                    let avgJitter = 0;
                    let jitterCount = 0;

                    stats.forEach(stat => {
                        if (stat.type === 'inbound-rtp') {
                            totalPacketsLost += stat.packetsLost || 0;
                            totalPackets += stat.packetsReceived || 0;
                            if (stat.jitter) {
                                avgJitter += stat.jitter;
                                jitterCount++;
                            }
                        }
                    });

                    const packetLossRate = totalPackets ? (totalPacketsLost / totalPackets) * 100 : 0;
                    const avgJitterMs = jitterCount ? (avgJitter / jitterCount) * 1000 : 0;

                    let quality;
                    if (packetLossRate > 5 || avgJitterMs > 100) {
                        quality = 'poor';
                    } else if (packetLossRate > 2 || avgJitterMs > 50) {
                        quality = 'fair';
                    } else {
                        quality = 'good';
                    }

                    const qualityIndicator = videoContainer.querySelector('.connection-quality');
                    if (qualityIndicator) {
                        qualityIndicator.innerHTML = `<span class="quality-dot ${quality}"></span> Connection: ${quality.charAt(0).toUpperCase() + quality.slice(1)}`;
                    }

                    // Notify peer about connection quality
                    if (currentRoom) {
                        socket.emit('connection-quality', { room: currentRoom, quality });
                    }
                });
            }
        }, 2000);

        // Handle remote tracks
        peerConnection.ontrack = (event) => {
            if (!event.streams || event.streams.length === 0) {
                console.warn('No streams in track event');
                return;
            }

            const stream = event.streams[0];
            console.log('Received remote track:', event.track.kind);
            
            // Set up remote video
            if (remoteVideo) {
                remoteVideo.srcObject = stream;
                remoteStream = stream;
            }
        };

        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            switch (peerConnection.connectionState) {
                case 'connected':
                    updateState(STATE.CONNECTED);
                    break;
                case 'disconnected':
                case 'failed':
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        reconnectAttempts++;
                        console.log(`Connection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
                        peerConnection.restartIce();
                    } else {
                        showMessage('Connection failed. Please try again.', 'error');
                        resetVideoCall();
                    }
                    break;
            }
        };

        // ICE connection monitoring
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed') {
                peerConnection.restartIce();
            }
        };

        // ICE candidate handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('New ICE candidate:', event.candidate.type);
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    room: currentRoom
                });
            }
        };

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

            console.log('Received offer:', data.offer.type);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('Set remote description from offer');

            // Process any buffered candidates
            if (peerConnection._pendingCandidates?.length > 0) {
                console.log(`Processing ${peerConnection._pendingCandidates.length} buffered ICE candidates`);
                for (const candidate of peerConnection._pendingCandidates) {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                        console.log('Added buffered ICE candidate');
                    } catch (error) {
                        console.warn('Error adding buffered ICE candidate:', error);
                    }
                }
                peerConnection._pendingCandidates = [];
            }

            const answer = await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            console.log('Created answer');

            await peerConnection.setLocalDescription(answer);
            console.log('Set local description (answer)');

            // Wait briefly for initial ICE candidates
            await new Promise(resolve => setTimeout(resolve, 1000));

            socket.emit('answer', {
                answer: peerConnection.localDescription,
                room: currentRoom
            });
            console.log('Sent answer to signaling server');

            updateState(STATE.CONNECTING);
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Failed to process connection offer', 'error');
            resetVideoCall();
        }
    });

    socket.on('answer', async (data) => {
        try {
            if (!peerConnection) {
                showMessage('Connection not initialized', 'error');
                return;
            }

            console.log('Received answer:', data.answer.type);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('Set remote description from answer');

            updateState(STATE.CONNECTING);
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Failed to process connection answer', 'error');
            resetVideoCall();
        }
    });

    socket.on('ice-candidate', async (data) => {
        try {
            if (!peerConnection) return;

            // Buffer candidates if remote description isn't set
            if (!peerConnection.remoteDescription) {
                console.log('Buffering ICE candidate');
                if (!peerConnection._pendingCandidates) {
                    peerConnection._pendingCandidates = [];
                }
                peerConnection._pendingCandidates.push(data.candidate);
                return;
            }

            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('Added ICE candidate:', data.candidate.type);
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
    if (!peerConnection) {
        showMessage('Connection not initialized', 'error');
        return;
    }

    try {
        // Create offer with specific constraints
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            iceRestart: reconnectAttempts > 0
        });

        console.log('Created offer:', offer.type);
        await peerConnection.setLocalDescription(offer);
        console.log('Set local description');

        // Wait for ICE gathering with timeout
        try {
            await Promise.race([
                new Promise((resolve) => {
                    if (peerConnection.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        peerConnection.addEventListener('icegatheringstatechange', () => {
                            if (peerConnection.iceGatheringState === 'complete') {
                                resolve();
                            }
                        });
                    }
                }),
                new Promise((resolve) => {
                    setTimeout(() => {
                        console.log('ICE gathering timed out, proceeding with available candidates');
                        if (peerConnection.iceGatheringState !== 'complete') {
                            console.warn(`ICE gathering state at timeout: ${peerConnection.iceGatheringState}`);
                            console.warn(`Candidates gathered: ${peerConnection._iceCandidates?.length || 0}`);
                        }
                        resolve();
                    }, 5000);
                })
            ]);
        } catch (error) {
            console.warn('ICE gathering incomplete:', error);
        }

        // Send offer with current description
        socket.emit('offer', {
            offer: peerConnection.localDescription,
            room: currentRoom
        });
        console.log('Sent offer to signaling server');

        updateState(STATE.CONNECTING);
    } catch (error) {
        console.error('Error creating/sending offer:', error);
        showMessage('Failed to create connection offer', 'error');
        resetVideoCall();
    }
}

function resetVideoCall() {
    console.log('Resetting video call...');

    // Stop all media tracks
    if (localStream) {
        console.log('Stopping local stream tracks');
        localStream.getTracks().forEach(track => {
            track.stop();
            console.log(`Stopped local ${track.kind} track`);
        });
        localStream = null;
    }

    if (remoteStream) {
        console.log('Stopping remote stream tracks');
        remoteStream.getTracks().forEach(track => {
            track.stop();
            console.log(`Stopped remote ${track.kind} track`);
        });
        remoteStream = null;
    }

    // Clean up peer connection
    if (peerConnection) {
        console.log('Cleaning up peer connection');
        
        // Remove all event listeners
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onsignalingstatechange = null;
        peerConnection.onicegatheringstatechange = null;
        peerConnection.onconnectionstatechange = null;

        // Close the connection
        peerConnection.close();
        peerConnection = null;
    }

    // Clear video elements
    if (localVideo) {
        localVideo.srcObject = null;
        console.log('Cleared local video source');
    }
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        console.log('Cleared remote video source');
    }

    // Reset state variables
    currentRoom = null;
    reconnectAttempts = 0;

    // Clear any quality monitoring intervals
    if (window._qualityMonitorInterval) {
        clearInterval(window._qualityMonitorInterval);
        window._qualityMonitorInterval = null;
    }

    // Update UI state
    updateState(STATE.IDLE);
    console.log('Reset complete');
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