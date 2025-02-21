import { configuration, startLocalStream } from './webrtc.js';

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

    switch (state) {
        case STATE.WAITING:
            showMessage('Waiting for a match...', 'info');
            if (connectButton) connectButton.style.display = 'none';
            if (leaveButton) leaveButton.style.display = 'block';
            break;
        case STATE.CONNECTING:
            showMessage('Establishing connection...', 'info');
            if (videoContainer) videoContainer.style.display = 'grid';
            if (selectionContainer) selectionContainer.style.display = 'none';
            break;
        case STATE.CONNECTED:
            showMessage('Connected successfully', 'success');
            if (videoContainer) videoContainer.style.display = 'grid';
            if (selectionContainer) selectionContainer.style.display = 'none';
            break;
        case STATE.IDLE:
        default:
            if (videoContainer) videoContainer.style.display = 'none';
            if (selectionContainer) selectionContainer.style.display = 'flex';
            if (connectButton) {
                connectButton.style.display = 'block';
                connectButton.disabled = false;
            }
            if (leaveButton) leaveButton.style.display = 'none';
            break;
    }
}

function createPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // Add multiple TURN servers for redundancy
            {
                urls: ['turn:turn.gengolive.com:3478?transport=tcp',
                       'turn:turn.gengolive.com:3478?transport=udp'],
                username: 'your_username',
                credential: 'your_password'
            }
        ],
        iceTransportPolicy: 'all', // Try 'relay' if still having issues
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };

    const pc = new RTCPeerConnection(configuration);

    // Add local tracks to the connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        if (event.streams && event.streams[0]) {
            handleRemoteStream(event.streams[0]);
        }
    };

    // ICE connection monitoring
    pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
            restartIce();
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
            handleConnectionFailure();
        }
    };

    return pc;
}

let iceCandidateQueue = [];

function handleIceCandidate(candidate) {
    if (peerConnection.remoteDescription) {
        peerConnection.addIceCandidate(candidate);
    } else {
        iceCandidateQueue.push(candidate);
    }
}

async function setRemoteDescription(description) {
    await peerConnection.setRemoteDescription(description);
    // Process queued candidates after remote description is set
    while (iceCandidateQueue.length) {
        const candidate = iceCandidateQueue.shift();
        await peerConnection.addIceCandidate(candidate);
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

                console.log('Creating offer');
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                    voiceActivityDetection: true
                });

                // Add mandatory video codecs
                offer.sdp = offer.sdp.replace(
                    /(m=video.*\r\n)/g,
                    '$1a=fmtp:96 profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1\r\n'
                );
                
                console.log('Setting local description');
                await peerConnection.setLocalDescription(offer);
                
                // Wait for ICE gathering to complete or timeout
                try {
                    await Promise.race([
                        new Promise((resolve) => {
                            if (peerConnection.iceGatheringState === 'complete') {
                                resolve();
                            } else {
                                peerConnection.onicegatheringstatechange = () => {
                                    if (peerConnection.iceGatheringState === 'complete') {
                                        resolve();
                                    }
                                };
                            }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('ICE gathering timeout')), 5000))
                    ]);
                    console.log('ICE gathering completed for offer');
                } catch (error) {
                    console.warn('ICE gathering did not complete for offer:', error);
                    // Continue anyway as we might still get a connection
                }
                
                console.log('Sending offer to peer');
                socket.emit('offer', {
                    offer: peerConnection.localDescription,
                    room: currentRoom
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

                // Wait a bit for ICE gathering to start
                await new Promise(resolve => setTimeout(resolve, 1000));

                console.log('Creating answer');
                const answer = await peerConnection.createAnswer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                
                console.log('Setting local description');
                await peerConnection.setLocalDescription(answer);
                console.log('Local description set successfully');

                // Wait for ICE gathering to complete or timeout
                try {
                    await Promise.race([
                        new Promise((resolve) => {
                            if (peerConnection.iceGatheringState === 'complete') {
                                resolve();
                            } else {
                                peerConnection.onicegatheringstatechange = () => {
                                    if (peerConnection.iceGatheringState === 'complete') {
                                        resolve();
                                    }
                                };
                            }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('ICE gathering timeout')), 10000))
                    ]);
                    console.log('ICE gathering completed');
                } catch (error) {
                    console.warn('ICE gathering did not complete:', error);
                    // Continue anyway as we might still get a connection
                }

                console.log('Sending answer to peer');
                socket.emit('answer', { answer: peerConnection.localDescription, room: currentRoom });
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
            if (peerConnection && document.getElementById('role').value === 'practice') {
                if (!data.answer || !data.answer.type || !data.answer.sdp) {
                    throw new Error('Invalid answer format received');
                }

                console.log('Setting remote description');
                await setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('Remote description set successfully');

                // Wait for connection to establish with multiple checks
                let connectionTimeout;
                try {
                    await Promise.race([
                        new Promise((resolve, reject) => {
                            const checkState = () => {
                                if (!peerConnection) return false;
                                
                                const state = peerConnection?.connectionState;
                                const iceState = peerConnection?.iceConnectionState;
                                console.log('Checking states - Connection:', state, 'ICE:', iceState);

                                if (state === 'connected' || iceState === 'connected') {
                                    return true;
                                } else if (['failed', 'closed'].includes(state) || ['failed', 'closed'].includes(iceState)) {
                                    throw new Error('Connection failed');
                                }
                                return false;
                            };

                            // Check every second
                            const intervalId = setInterval(checkState, 1000);
                            
                            // Set up state change handlers
                            peerConnection.onconnectionstatechange = () => {
                                checkState();
                                if (peerConnection.connectionState === 'connected') {
                                    clearInterval(intervalId);
                                    resolve();
                                }
                            };
                            
                            peerConnection.oniceconnectionstatechange = () => {
                                checkState();
                                if (peerConnection.iceConnectionState === 'connected') {
                                    clearInterval(intervalId);
                                    resolve();
                                }
                            };

                            // Initial check
                            checkState();

                            // Store cleanup function
                            connectionTimeout = () => {
                                clearInterval(intervalId);
                                reject(new Error('Connection timeout'));
                            };
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 20000))
                    ]);
                } catch (error) {
                    if (error.message === 'Connection timeout') {
                        console.warn('Connection timed out, but media might still connect...');
                        // Give it a bit more time for media
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        
                        // Check one last time
                        if (peerConnection.connectionState === 'connected' ||
                            peerConnection.iceConnectionState === 'connected') {
                            console.log('Connection recovered after timeout');
                        } else {
                            throw error;
                        }
                    } else {
                        throw error;
                    }
                }

                console.log('Connection established successfully');
                updateState(STATE.CONNECTED);
            }
        } catch (error) {
            console.error('Error in answer handler:', error);
            if (error.message === 'Connection timeout') {
                showMessage('Connection timed out. Please try again.', 'error');
            } else {
                showMessage('Failed to establish connection', 'error');
            }
            resetVideoCall();
        }
    });

    socket.on('ice-candidate', async (data) => {
        if (!peerConnection) {
            // Store candidate if connection isn't ready
            iceCandidatesBuffer.push(data.candidate);
            return;
        }
        
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.warn('Error adding ICE candidate:', error);
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

// Add buffered candidates after peer connection is created
async function addBufferedCandidates() {
    while (iceCandidatesBuffer.length) {
        const candidate = iceCandidatesBuffer.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.warn('Error adding buffered ICE candidate:', error);
        }
    }
}

async function handleRemoteStream(stream) {
    const remoteVideo = document.getElementById('remoteVideo');
    if (!remoteVideo) return;

    try {
        // Store the remote stream globally
        remoteStream = stream;
        
        // Ensure all tracks are enabled
        stream.getTracks().forEach(track => {
            track.enabled = true;
        });

        remoteVideo.srcObject = stream;
        
        // Add event listeners for track ended/muted
        stream.getTracks().forEach(track => {
            track.onended = () => {
                console.log('Remote track ended:', track.kind);
                showMessage('Remote peer disconnected', 'warning');
            };
            track.onmute = () => {
                console.log('Remote track muted:', track.kind);
                showMessage('Remote peer muted', 'info');
            };
        });

        // Wait for metadata to load
        await new Promise((resolve, reject) => {
            remoteVideo.onloadedmetadata = resolve;
            setTimeout(() => reject(new Error('Metadata loading timeout')), 5000);
        });

        // Attempt to play
        try {
            await remoteVideo.play();
            console.log('Remote video playing successfully');
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                addPlayButton(remoteVideo);
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error handling remote stream:', error);
        showMessage('Video connection issues. Please refresh.', 'error');
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
            console.error('Error playing video:', error);
            showMessage('Failed to play video', 'error');
        }
    };
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
        resetConnection();
        initializeConnection();
    } else {
        showMessage('Connection failed permanently. Please try again.');
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

function monitorConnectionState() {
    if (!peerConnection) return;

    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        switch (peerConnection.connectionState) {
            case 'failed':
                handleConnectionRetry();
                break;
            case 'disconnected':
                setTimeout(() => {
                    if (peerConnection.connectionState === 'disconnected') {
                        handleConnectionRetry();
                    }
                }, 2000);
                break;
            case 'connected':
                reconnectAttempts = 0; // Reset counter on successful connection
                break;
        }
    };
}

async function handleConnectionRetry() {
    if (!peerConnection || !currentRoom) return;

    try {
        await peerConnection.restartIce();
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            offer: peerConnection.localDescription,
            room: currentRoom
        });
    } catch (error) {
        console.error('Reconnection attempt failed:', error);
        handleConnectionFailure();
    }
}

function restartIce() {
    if (peerConnection) {
        peerConnection.restartIce();
        // Create and send new offer with ice-restart: true
        createAndSendOffer({ iceRestart: true });
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
        } catch (error) {
            console.warn('ICE gathering incomplete:', error);
        }

        // Send offer to peer
        socket.emit('offer', {
            offer: peerConnection.localDescription,
            room: currentRoom,
            candidates: iceCandidates
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