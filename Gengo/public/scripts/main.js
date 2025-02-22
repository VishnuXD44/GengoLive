import { startLocalStream } from './webrtc.js';

// Replace import style initialization with direct access
const socket = io(window.location.origin, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentRoom = null;

const CONNECTION_STATES = {
    IDLE: 'idle',
    QUEUED: 'queued',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    FAILED: 'failed'
};

let connectionState = CONNECTION_STATES.IDLE;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

const STATE = {
    IDLE: 'idle',
    WAITING: 'waiting',
    CONNECTING: 'connecting',
    CONNECTED: 'connected'
};

let currentState = STATE.IDLE;

function updateState(newState) {
    currentState = newState;
    updateUI(currentState);
}

function updateUI(state) {
    const videoContainer = document.querySelector('.video-container');
    const selectionContainer = document.querySelector('.selection-container');
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
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
            const connectingMessage = role === 'practice'
                ? 'Connecting to your language coach...'
                : 'Connecting to your practice partner...';
            showMessage(connectingMessage, 'info');
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
            break;
            
        case STATE.IDLE:
        default:
            if (videoContainer) {
                videoContainer.style.display = 'none';
                const indicator = videoContainer.querySelector('.waiting-indicator');
                if (indicator) indicator.remove();
                const roleInd = videoContainer.querySelector('.role-indicator');
                if (roleInd) roleInd.remove();
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

async function createPeerConnection() {
    try {
        // Fetch ICE servers with retry logic
        let iceServers;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch('/api/get-ice-servers');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                iceServers = await response.json();
                console.log(`Fetched ICE servers (attempt ${attempt}):`, iceServers);
                break;
            } catch (error) {
                console.warn(`ICE servers fetch attempt ${attempt} failed:`, error);
                if (attempt === 3) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (!Array.isArray(iceServers) || iceServers.length === 0) {
            throw new Error('Invalid ICE servers configuration received');
        }

        const configuration = {
            iceServers,
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            sdpSemantics: 'unified-plan'
        };

        console.log('Creating RTCPeerConnection with config:', JSON.stringify(configuration, null, 2));
        const pc = new RTCPeerConnection(configuration);

        // Add local tracks to the connection if not already added
        if (localStream) {
            const existingSenders = pc.getSenders();
            localStream.getTracks().forEach(track => {
                const hasTrack = existingSenders.some(sender => sender.track && sender.track.id === track.id);
                if (!hasTrack) {
                    console.log(`Adding local ${track.kind} track to peer connection`);
                    pc.addTrack(track, localStream);
                } else {
                    console.log(`Track ${track.kind} already exists in peer connection`);
                }
            });
        }

        // Handle incoming tracks
        pc.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            if (!event.streams || event.streams.length === 0) {
                console.warn('No streams in track event');
                return;
            }

            const stream = event.streams[0];
            console.log('Remote stream ID:', stream.id);
            console.log('Remote stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`));

            // Enable tracks immediately
            event.track.enabled = true;

            // Handle the remote stream
            handleRemoteStream(stream);
        };

        // Log all negotiation needed events
        pc.onnegotiationneeded = () => {
            console.log('Negotiation needed event fired');
        };

        // Set up ICE candidate handler
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('New ICE candidate:', event.candidate.type);
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    room: currentRoom
                });
            }
        };

        // Log when tracks are removed
        pc.onremovetrack = (event) => {
            console.log('Track removed:', event.track.kind);
        };

        // ICE connection monitoring with enhanced state tracking
        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log('ICE connection state changed:', state);
            
            switch (state) {
                case 'checking':
                    console.log('Checking ICE candidates...');
                    break;
                case 'connected':
                    console.log('ICE connection established');
                    // Reset any reconnection attempts
                    reconnectAttempts = 0;
                    break;
                case 'disconnected':
                    console.log('ICE connection disconnected, waiting for recovery...');
                    // Wait briefly for auto-recovery
                    setTimeout(() => {
                        if (pc.iceConnectionState === 'disconnected') {
                            console.log('Attempting to recover disconnected state...');
                            restartIce();
                        }
                    }, 2000);
                    break;
                case 'failed':
                    console.log('ICE connection failed, attempting restart...');
                    restartIce();
                    break;
                case 'closed':
                    console.log('ICE connection closed');
                    break;
            }
        };

        // Connection state monitoring with enhanced error handling
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log('Connection state changed:', state);
            
            switch (state) {
                case 'connecting':
                    console.log('Establishing connection...');
                    break;
                case 'connected':
                    console.log('Connection established successfully');
                    updateState(STATE.CONNECTED);
                    break;
                case 'disconnected':
                    console.log('Connection disconnected, attempting recovery...');
                    setTimeout(() => {
                        if (pc.connectionState === 'disconnected') {
                            handleConnectionRetry();
                        }
                    }, 2000);
                    break;
                case 'failed':
                    console.log('Connection failed permanently');
                    handleConnectionFailure();
                    break;
                case 'closed':
                    console.log('Connection closed');
                    break;
            }
        };

        // Monitor ICE gathering state
        pc.onicegatheringstatechange = () => {
            console.log('ICE gathering state:', pc.iceGatheringState);
            if (pc.iceGatheringState === 'complete') {
                console.log('ICE gathering completed');
            }
        };

        return pc;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw error;
    }
}

// Single buffer for ICE candidates
let iceCandidatesBuffer = [];

async function handleIceCandidate(candidate) {
    if (!peerConnection) return;
    
    try {
        if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Added ICE candidate:', {
                type: candidate.type,
                protocol: candidate.protocol,
                address: candidate.address,
                port: candidate.port
            });
        } else {
            iceCandidatesBuffer.push(candidate);
            console.log('Buffered ICE candidate:', candidate);
        }
    } catch (error) {
        console.warn('Error handling ICE candidate:', error);
    }
}

async function setRemoteDescription(description) {
    console.log('Setting remote description:', description);
    try {
        await peerConnection.setRemoteDescription(description);
        console.log('Remote description set successfully');
        
        // Process buffered candidates
        while (iceCandidatesBuffer.length) {
            const candidate = iceCandidatesBuffer.shift();
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added buffered ICE candidate');
            } catch (error) {
                console.warn('Error adding buffered ICE candidate:', error);
            }
        }
    } catch (error) {
        console.error('Error setting remote description:', error);
        handleConnectionFailure();
    }
}

function setupSocketListeners() {
    socket.on('match-found', async (data) => {
        currentRoom = data.room;
        console.log('Match found in room:', currentRoom);
        showMessage('Match found! Connecting...', 'info');

        try {
            // Only the practice user initiates the offer
            if (document.getElementById('role').value === 'practice') {
                if (peerConnection) {
                    console.log('Cleaning up existing peer connection');
                    peerConnection.close();
                    peerConnection = null;
                }

                console.log('Creating peer connection as practice user');
                peerConnection = await createPeerConnection();

                // ICE candidates will be gathered automatically
                const iceCandidates = [];
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('New ICE candidate:', event.candidate.type);
                        iceCandidates.push(event.candidate);
                        socket.emit('ice-candidate', {
                            candidate: event.candidate,
                            room: currentRoom
                        });
                    }
                };

                // Create and send offer with ICE candidates
                await createAndSendOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
            }
        } catch (error) {
            console.error('Error in match-found handler:', error);
            showMessage('Failed to create connection', 'error');
            resetVideoCall();
        }
    });

    socket.on('offer', async (data) => {
        console.log('Received offer in room:', data.room);
        updateState(STATE.CONNECTING);
        
        try {
            if (document.getElementById('role').value === 'coach') {
                if (!data.offer || !data.offer.type || !data.offer.sdp) {
                    throw new Error('Invalid offer format received');
                }

                if (peerConnection) {
                    console.log('Cleaning up existing peer connection');
                    peerConnection.close();
                    peerConnection = null;
                }

                console.log('Creating peer connection as coach');
                peerConnection = await createPeerConnection();
                
                console.log('Setting remote description');
                await setRemoteDescription(new RTCSessionDescription(data.offer));
                console.log('Remote description set successfully');

                // Process any bundled ICE candidates
                if (data.candidates && Array.isArray(data.candidates)) {
                    console.log(`Processing ${data.candidates.length} bundled ICE candidates`);
                    for (const candidate of data.candidates) {
                        try {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                            console.log('Added bundled ICE candidate');
                        } catch (error) {
                            console.warn('Error adding bundled ICE candidate:', error);
                        }
                    }
                }

                // Set up ICE candidate handler for this connection
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('New ICE candidate:', event.candidate.type);
                        socket.emit('ice-candidate', {
                            candidate: event.candidate,
                            room: currentRoom
                        });
                    }
                };

                // Gather ICE candidates for the answer
                const iceCandidates = [];
                const gatheringComplete = new Promise((resolve) => {
                    peerConnection.onicecandidate = (event) => {
                        if (event.candidate) {
                            console.log('New ICE candidate:', event.candidate.type);
                            iceCandidates.push(event.candidate);
                            socket.emit('ice-candidate', {
                                candidate: event.candidate,
                                room: currentRoom
                            });
                        } else {
                            console.log('ICE gathering completed');
                            resolve();
                        }
                    };
                });

                console.log('Creating answer');
                const answer = await peerConnection.createAnswer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                
                console.log('Setting local description');
                await peerConnection.setLocalDescription(answer);
                console.log('Local description set successfully');

                // Wait for ICE gathering with timeout
                try {
                    await Promise.race([
                        gatheringComplete,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('ICE gathering timeout')), 10000))
                    ]);
                } catch (error) {
                    console.warn('ICE gathering did not complete:', error);
                }

                console.log(`Sending answer with ${iceCandidates.length} ICE candidates`);
                socket.emit('answer', {
                    answer: peerConnection.localDescription,
                    room: currentRoom,
                    candidates: iceCandidates
                });
            }
        } catch (error) {
            console.error('Error in offer handler:', error);
            showMessage('Failed to establish connection', 'error');
            resetVideoCall();
        }
    });

    socket.on('answer', async (data) => {
        console.log('Received answer in room:', data.room);
        try {
            if (document.getElementById('role').value === 'coach') {
                if (!data.answer || !data.answer.type || !data.answer.sdp) {
                    throw new Error('Invalid answer format received');
                }

                if (peerConnection) {
                    console.log('Cleaning up existing peer connection');
                    peerConnection.close();
                    peerConnection = null;
                }

                console.log('Creating peer connection as coach');
                peerConnection = await createPeerConnection();
                
                console.log('Setting remote description');
                await setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('Remote description set successfully');

                // Process any bundled ICE candidates
                if (data.candidates && Array.isArray(data.candidates)) {
                    console.log(`Processing ${data.candidates.length} bundled ICE candidates from answer`);
                    for (const candidate of data.candidates) {
                        try {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                            console.log('Added bundled ICE candidate from answer');
                        } catch (error) {
                            console.warn('Error adding bundled ICE candidate from answer:', error);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error in answer handler:', error);
            showMessage('Failed to establish connection', 'error');
            resetVideoCall();
        }
    });

    socket.on('ice-candidate', async (data) => {
        if (!peerConnection) return;
        
        try {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                iceCandidatesBuffer.push(data.candidate);
            }
        } catch (error) {
            console.warn('Error handling ICE candidate:', error);
        }
    });

    socket.on('user-disconnected', () => {
        console.log('Remote user disconnected');
        showMessage('Remote user disconnected', 'warning');
        resetVideoCall();
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        showMessage('Connection to server failed', 'error');
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        showMessage('Disconnected from server', 'warning');
        resetVideoCall();
    });
}

async function handleRemoteStream(stream) {
    try {
        const remoteVideo = document.getElementById('remoteVideo');
        if (!remoteVideo) return;

        remoteVideo.srcObject = stream;
        
        // Add retry logic for metadata loading
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Metadata loading timeout'));
                    }, 5000);

                    remoteVideo.onloadedmetadata = () => {
                        clearTimeout(timeout);
                        resolve();
                    };
                });
                break; // Success, exit loop
            } catch (error) {
                attempts++;
                if (attempts === maxAttempts) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
            }
        }

        await remoteVideo.play();
        showMessage('Remote video connected');
        
    } catch (error) {
        console.error('Error handling remote stream:', error);
        if (error.name === 'AbortError') {
            // Handle interrupted play request
            setTimeout(() => {
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo && remoteVideo.srcObject) {
                    remoteVideo.play().catch(console.error);
                }
            }, 1000);
        } else {
            showMessage('Failed to connect remote video', 'error');
            handleConnectionFailure();
        }
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

    localStream = null;
    remoteStream = null;
    currentRoom = null;

    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    const videoContainer = document.querySelector('.video-container');
    const selectionContainer = document.querySelector('.selection-container');
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');

    if (videoContainer) videoContainer.style.display = 'none';
    if (selectionContainer) selectionContainer.style.display = 'flex';
    if (connectButton) {
        connectButton.style.display = 'block';
        connectButton.disabled = false;
    }
    if (leaveButton) leaveButton.style.display = 'none';
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 5000);
}

function handleConnectionFailure() {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        showMessage(`Connection failed. Retrying... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        
        // Clean up existing connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // Reinitialize the connection
        initializeCall().catch(error => {
            console.error('Failed to reinitialize connection:', error);
            showMessage('Failed to reconnect. Please try again.');
            resetVideoCall();
        });
    } else {
        showMessage('Connection failed permanently. Please try again.');
        resetVideoCall();
    }
}

// Initialize or reinitialize connection
async function initializeConnection() {
    try {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        await initializeCall();
        
        // Rejoin room if we were in one
        if (currentRoom) {
            const role = document.getElementById('role').value;
            const language = document.getElementById('language').value;
            socket.emit('join', { language, role });
        }
    } catch (error) {
        console.error('Failed to initialize connection:', error);
        showMessage('Failed to establish connection. Please try again.');
        resetVideoCall();
    }
}

async function initializeCall() {
    try {
        updateState(STATE.CONNECTING);
        localStream = await startLocalStream();
        if (!localStream) {
            throw new Error('Failed to get local stream');
        }
        peerConnection = await createPeerConnection();
        updateState(STATE.WAITING);
    } catch (error) {
        console.error('Call initialization failed:', error);
        showMessage(error.message, 'error');
        updateState(STATE.IDLE);
    }
}

function addConnectionTimeout() {
    setTimeout(() => {
        if (peerConnection && peerConnection.connectionState !== 'connected') {
            console.warn('Connection timeout - attempting recovery');
            handleConnectionFailure();
        }
    }, 20000); // 20 seconds timeout
}

function monitorConnectionState() {
    if (!peerConnection) return;

    let failureTimeout;

    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state changed:', {
            connectionState: peerConnection.connectionState,
            iceConnectionState: peerConnection.iceConnectionState,
            iceGatheringState: peerConnection.iceGatheringState,
            signalingState: peerConnection.signalingState
        });
        
        // Clear any existing timeout
        if (failureTimeout) {
            clearTimeout(failureTimeout);
        }

        switch (peerConnection.connectionState) {
            case 'connecting':
                // Set timeout for connection attempt
                failureTimeout = setTimeout(() => {
                    if (peerConnection.connectionState === 'connecting') {
                        handleConnectionFailure();
                    }
                }, 15000); // 15 seconds timeout
                break;
            case 'connected':
                reconnectAttempts = 0;
                break;
            case 'failed':
                handleConnectionFailure();
                break;
            case 'disconnected':
                // Wait briefly before attempting reconnection
                setTimeout(() => {
                    if (peerConnection.connectionState === 'disconnected') {
                        restartConnection();
                    }
                }, 2000);
                break;
        }
    };
}

async function handleConnectionRetry() {
    try {
        if (!peerConnection || !currentRoom) return;

        console.log('Attempting connection retry');
        await peerConnection.restartIce();
        await createAndSendOffer({ iceRestart: true });
        console.log('Connection retry initiated');
    } catch (error) {
        console.error('Reconnection attempt failed:', error);
        handleConnectionFailure();
    }
}

async function restartIce() {
    if (!peerConnection || !currentRoom) {
        console.warn('Cannot restart ICE - no active connection');
        return;
    }

    try {
        console.log('Initiating ICE restart');
        await peerConnection.restartIce();
        await createAndSendOffer({ iceRestart: true });
        console.log('ICE restart initiated successfully');
    } catch (error) {
        console.error('Failed to restart ICE:', error);
        showMessage('Connection recovery failed', 'error');
        // If ICE restart fails, attempt full reconnection
        handleConnectionFailure();
    }
}

async function createAndSendOffer(options = {}) {
    if (!peerConnection || !currentRoom) {
        console.error('Cannot create offer - no peer connection or room');
        return;
    }

    try {
        // Create offer with trickle ICE and other options
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            iceRestart: options.iceRestart || false
        });

        // Add iceRestart flag to the offer for server handling
        if (options.iceRestart) {
            offer.iceRestart = true;
        }

        // Set local description before gathering ICE candidates
        await peerConnection.setLocalDescription(offer);

        // Wait for ICE gathering with timeout
        let iceCandidates = [];
        try {
            await Promise.race([
                new Promise((resolve) => {
                    const gatherCandidates = (event) => {
                        if (event.candidate) {
                            iceCandidates.push(event.candidate);
                        } else {
                            resolve();
                            peerConnection.removeEventListener('icecandidate', gatherCandidates);
                        }
                    };
                    peerConnection.addEventListener('icecandidate', gatherCandidates);
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('ICE gathering timeout')), 5000))
            ]);
            console.log(`Gathered ${iceCandidates.length} ICE candidates`);
        } catch (error) {
            console.warn('ICE gathering incomplete:', error);
            // Continue with the candidates we have
            console.log(`Proceeding with ${iceCandidates.length} gathered candidates`);
        }

        // Send offer to peer with gathered candidates
        socket.emit('offer', {
            offer: peerConnection.localDescription,
            room: currentRoom,
            candidates: iceCandidates
        });

        console.log('Sent offer with ICE candidates:', {
            iceRestart: options.iceRestart || false,
            candidateCount: iceCandidates.length
        });

    } catch (error) {
        console.error('Error creating/sending offer:', error);
        showMessage('Failed to create connection offer', 'error');
    }
}

function monitorMediaStreams() {
    if (!peerConnection) return;

    peerConnection.getReceivers().forEach(receiver => {
        if (receiver.track) {
            receiver.track.onended = () => {
                console.log('Remote track ended:', receiver.track.kind);
                handleStreamEnded();
            };
            
            receiver.track.onmute = () => {
                console.log('Remote track muted:', receiver.track.kind);
            };
            
            receiver.track.onunmute = () => {
                console.log('Remote track unmuted:', receiver.track.kind);
            };
        }
    });
}

function handleStreamEnded() {
    showMessage('Stream ended. Attempting to reconnect...', 'warning');
    restartConnection();
}

async function restartConnection() {
    try {
        if (peerConnection && peerConnection.connectionState !== 'closed') {
            await restartIce();
        } else {
            await initializeCall();
        }
    } catch (error) {
        console.error('Failed to restart connection:', error);
        showMessage('Connection failed. Please refresh the page.', 'error');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    const videoContainer = document.querySelector('.video-container');
    const selectionContainer = document.querySelector('.selection-container');

    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            try {
                // Show loading state
                connectButton.disabled = true;
                connectButton.classList.add('loading');
                
                // Get selected options
                const language = document.getElementById('language').value;
                const role = document.getElementById('role').value;

                // Initialize local stream
                localStream = await startLocalStream();
                
                // Show video container
                if (videoContainer) videoContainer.style.display = 'grid';
                if (selectionContainer) selectionContainer.style.display = 'none';
                if (leaveButton) leaveButton.style.display = 'block';
                
                // Join room
                socket.emit('join', { language, role });
                updateState(STATE.WAITING);
                
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

// Set up socket listeners
setupSocketListeners();