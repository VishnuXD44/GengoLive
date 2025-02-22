import { startLocalStream } from './webrtc.js';

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

// Socket.io initialization with better error handling
let socket;
try {
    // Use different connection URL based on environment
    const socketUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'  // Development server
        : window.location.origin;   // Production server

    console.log('Connecting to socket.io server at:', socketUrl);
    socket = io(socketUrl, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        autoConnect: false, // Don't connect automatically
        forceNew: true     // Force a new connection
    });

    // Debug socket connection
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        showMessage(`Connection error: ${error.message}`, 'error');
    });

    socket.on('connect', () => {
        console.log('Socket connected successfully');
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
    });

    // Handle connection events
    socket.on('connect', () => {
        console.log('Connected to server');
        if (connectButton) {
            connectButton.disabled = false;
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        showMessage('Failed to connect to server. Please try again.', 'error');
        if (connectButton) {
            connectButton.disabled = false;
            connectButton.classList.remove('loading');
        }
    });

    // Connect to socket server
    socket.connect();
} catch (error) {
    console.error('Failed to initialize socket:', error);
    showMessage('Failed to initialize connection. Please refresh the page.', 'error');
}

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

    switch (state) {
        case STATE.WAITING:
            const roleSpecificMessage = role === 'practice'
                ? `Waiting for a ${language} language coach...`
                : `Waiting for a ${language} language practice partner...`;
            showMessage(roleSpecificMessage, 'info');
            
            if (connectButton) connectButton.style.display = 'none';
            if (leaveButton) leaveButton.style.display = 'block';
            
            if (videoContainer) {
                videoContainer.style.display = 'grid';
                // Add waiting indicator if not present
                if (!videoContainer.querySelector('.waiting-indicator')) {
                    const waitingIndicator = document.createElement('div');
                    waitingIndicator.className = 'waiting-indicator';
                    waitingIndicator.innerHTML = `
                        <div class="spinner"></div>
                        <p>${roleSpecificMessage}</p>
                        <p class="queue-position">Searching for a match...</p>
                    `;
                    videoContainer.appendChild(waitingIndicator);
                }
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
        
        // Request media permissions first
        try {
            localStream = await startLocalStream();
            if (!localStream) {
                throw new Error('Failed to get local stream');
            }
            console.log('Got local stream:', localStream.getTracks().map(t => t.kind).join(', '));
        } catch (mediaError) {
            console.error('Media access error:', mediaError);
            throw new Error('Please allow access to camera and microphone to continue');
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
        console.log('Created peer connection');

        // Add local stream tracks to peer connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log(`Added local ${track.kind} track to peer connection`);
            });
        }

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
                console.log('Set remote video stream');
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

            const answer = await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            console.log('Created answer');

            await peerConnection.setLocalDescription(answer);
            console.log('Set local description (answer)');

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

    socket.on('peer-disconnected', () => {
        showMessage('Your partner has disconnected', 'warning');
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
    // Initialize UI elements
    if (!videoContainer || !selectionContainer || !connectButton || !leaveButton) {
        console.error('Required UI elements not found');
        showMessage('Failed to initialize UI. Please refresh the page.', 'error');
        return;
    }

    // Connect button handler
    connectButton.addEventListener('click', async () => {
        try {
            // Check socket connection
            if (!socket) {
                showMessage('Socket not initialized. Please refresh the page.', 'error');
                return;
            }

            if (!socket.connected) {
                showMessage('Connecting to server...', 'info');
                socket.connect();
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
                    socket.once('connect', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    socket.once('connect_error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                });
            }

            // Disable button and show loading state
            connectButton.disabled = true;
            connectButton.classList.add('loading');
            showMessage('Initializing connection...', 'info');
            
            // Get and validate inputs
            const language = document.getElementById('language')?.value;
            const role = document.getElementById('role')?.value;

            if (!language || !role) {
                throw new Error('Please select both language and role');
            }

            // Initialize media devices first
            try {
                localStream = await startLocalStream();
                if (!localStream) {
                    throw new Error('Failed to get local stream');
                }
                console.log('Got local stream:', localStream.getTracks().map(t => t.kind).join(', '));
            } catch (mediaError) {
                console.error('Media access error:', mediaError);
                throw new Error('Please allow access to camera and microphone to continue');
            }

            // Initialize WebRTC connection
            await initializeCall();
            console.log('Initialized call, joining room...');

            // Join the room
            socket.emit('join', { language, role });
            
        } catch (error) {
            console.error('Error initializing call:', error);
            showMessage(error.message || 'Failed to initialize call', 'error');
            resetVideoCall();
        } finally {
            connectButton.disabled = false;
            connectButton.classList.remove('loading');
        }
    });

    // Leave button handler
    leaveButton.addEventListener('click', () => {
        console.log('Leave button clicked');
        resetVideoCall();
        showMessage('Disconnected', 'info');
    });

    // Initial UI state
    updateState(STATE.IDLE);

    // Set up socket listeners
    setupSocketListeners();
});