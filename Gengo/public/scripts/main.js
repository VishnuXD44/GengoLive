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
            const state = peerConnection.iceConnectionState;
            console.log('ICE Connection State:', state);
            
            switch (state) {
                case 'checking':
                    console.log('Establishing connection...');
                    showMessage('Establishing connection...', 'info');
                    break;
                case 'connected':
                    console.log('Connection established successfully');
                    showMessage('Connection established', 'success');
                    break;
                case 'completed':
                    console.log('ICE connection completed');
                    break;
                case 'failed':
                    console.error('ICE connection failed');
                    showMessage('Connection failed', 'error');
                    handleConnectionFailure();
                    break;
                case 'disconnected':
                    console.warn('ICE connection disconnected');
                    showMessage('Connection interrupted', 'warning');
                    // Don't reset immediately, allow for potential recovery
                    setTimeout(() => {
                        if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
                            resetVideoCall();
                        }
                    }, 5000);
                    break;
                case 'closed':
                    console.log('ICE connection closed');
                    resetVideoCall();
                    showMessage('Connection closed', 'info');
                    break;
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Connection State:', peerConnection.connectionState);
        };

        peerConnection.onicegatheringstatechange = () => {
            console.log('ICE Gathering State:', peerConnection.iceGatheringState);
        };

        peerConnection.onsignalingstatechange = () => {
            console.log('Signaling State:', peerConnection.signalingState);
        };

        peerConnection.ontrack = async (event) => {
            console.log('Received remote track:', event.track.kind);
            console.log('Track settings:', event.track.getSettings());
            console.log('Track constraints:', event.track.getConstraints());

            if (event.streams && event.streams[0]) {
                console.log('Setting remote stream from ontrack');
                remoteStream = event.streams[0];
                
                // Log stream information
                console.log('Remote stream ID:', remoteStream.id);
                console.log('Remote stream tracks:', remoteStream.getTracks().map(track => ({
                    kind: track.kind,
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState
                })));

                await handleRemoteStream(remoteStream);
            } else {
                console.warn('No stream received with track');
            }

            // Monitor track ending
            event.track.onended = () => {
                console.log('Remote track ended:', event.track.kind);
            };

            event.track.onmute = () => {
                console.log('Remote track muted:', event.track.kind);
            };

            event.track.onunmute = () => {
                console.log('Remote track unmuted:', event.track.kind);
            };
        };

        if (localStream) {
            try {
                localStream.getTracks().forEach(track => {
                    console.log('Adding local track:', track.kind);
                    peerConnection.addTrack(track, localStream);
                });
            } catch (error) {
                console.error('Error adding local tracks:', error);
                throw new Error('Failed to add local tracks to peer connection');
            }
        } else {
            console.warn('No local stream available when creating peer connection');
        }

        return peerConnection;
    } catch (error) {
        console.error('Error in createPeerConnection:', error);
        showMessage('Failed to create connection', 'error');
        throw error;
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
                    offerToReceiveVideo: true
                });
                
                console.log('Setting local description');
                await peerConnection.setLocalDescription(offer);
                
                console.log('Sending offer to peer');
                socket.emit('offer', { offer, room: currentRoom });
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
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
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
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('Remote description set successfully');

                // Wait for connection to establish
                await Promise.race([
                    new Promise((resolve, reject) => {
                        const checkState = () => {
                            console.log('Checking connection state:', peerConnection.connectionState);
                            if (peerConnection.connectionState === 'connected') {
                                resolve();
                            } else if (['failed', 'closed'].includes(peerConnection.connectionState)) {
                                reject(new Error('Connection failed'));
                            }
                        };
                        
                        peerConnection.onconnectionstatechange = checkState;
                        checkState(); // Check immediately in case already connected
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
                ]);

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
        console.log('Received ICE candidate for room:', data.room);
        try {
            if (!peerConnection) {
                console.warn('No peer connection available for ICE candidate');
                return;
            }

            if (currentRoom !== data.room) {
                console.warn('Received ICE candidate for wrong room');
                return;
            }

            if (!data.candidate || !data.candidate.candidate) {
                console.warn('Invalid ICE candidate format received');
                return;
            }

            // Check if we can add the ICE candidate
            const readyStates = ['stable', 'have-remote-offer', 'have-local-offer'];
            if (!readyStates.includes(peerConnection.signalingState)) {
                console.warn('Cannot add ICE candidate, invalid signaling state:', peerConnection.signalingState);
                return;
            }

            // Add the ICE candidate with timeout
            try {
                await Promise.race([
                    peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('ICE candidate timeout')), 5000))
                ]);
                console.log('Added ICE candidate successfully');

                // Log current connection states
                console.log('Current ICE connection state:', peerConnection.iceConnectionState);
                console.log('Current ICE gathering state:', peerConnection.iceGatheringState);
                console.log('Current signaling state:', peerConnection.signalingState);
                console.log('Current connection state:', peerConnection.connectionState);
            } catch (error) {
                if (error.message === 'ICE candidate timeout') {
                    console.warn('Timeout adding ICE candidate');
                } else {
                    throw error;
                }
            }
        } catch (error) {
            if (error.name === 'InvalidStateError') {
                console.warn('Invalid state while adding ICE candidate:', error);
            } else if (error.name === 'OperationError') {
                console.warn('Operation error while adding ICE candidate:', error);
            } else {
                console.error('Error processing ICE candidate:', error);
                showMessage('Connection issue detected', 'warning');
            }
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
    if (!stream) {
        console.error('No remote stream provided');
        return;
    }

    const remoteVideo = document.getElementById('remoteVideo');
    if (!remoteVideo) {
        console.error('Remote video element not found');
        return;
    }
    
    try {
        console.log('Setting up remote stream:', stream.id);
        console.log('Remote stream tracks:', stream.getTracks().map(track => track.kind));

        // Wait for any existing stream to be properly cleaned up
        if (remoteVideo.srcObject) {
            const oldStream = remoteVideo.srcObject;
            oldStream.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Set up new stream
        remoteVideo.muted = false;
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        
        // Create a promise to handle the loadedmetadata event
        const metadataLoaded = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Metadata loading timeout'));
            }, 5000);

            remoteVideo.onloadedmetadata = () => {
                clearTimeout(timeoutId);
                resolve();
            };
            remoteVideo.onerror = (e) => {
                clearTimeout(timeoutId);
                reject(e);
            };
        });

        // Set the stream
        remoteVideo.srcObject = stream;
        console.log('Remote stream set to video element');

        // Wait for metadata to load
        try {
            await metadataLoaded;
            console.log('Remote video metadata loaded successfully');
        } catch (error) {
            console.error('Error loading remote video metadata:', error);
            throw error;
        }

        // Attempt to play the video
        try {
            // Use a play promise to handle autoplay restrictions
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                await playPromise;
                console.log('Remote video playback started successfully');
                updateState(STATE.CONNECTED);
                showMessage('Connected to remote user', 'success');
            }
        } catch (playError) {
            console.error('Error playing remote video:', playError);
            if (playError.name === 'NotAllowedError' || playError.name === 'AbortError') {
                showMessage('Autoplay blocked. Click to play video.', 'warning');
                addPlayButton(remoteVideo);
            } else {
                throw playError;
            }
        }
    } catch (error) {
        console.error('Error handling remote stream:', error);
        showMessage('Failed to display remote video', 'error');
        // Try to recover by resetting video element
        remoteVideo.srcObject = null;
        setTimeout(() => {
            try {
                remoteVideo.srcObject = stream;
            } catch (retryError) {
                console.error('Recovery attempt failed:', retryError);
            }
        }, 1000);
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
        showMessage(`Connection failed. Retrying... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'warning');
        
        setTimeout(async () => {
            try {
                if (peerConnection) {
                    peerConnection.close();
                    peerConnection = null;
                }
                await initializeCall();
                
                const language = document.getElementById('language').value;
                const role = document.getElementById('role').value;
                socket.emit('join', { language, role });
                
            } catch (error) {
                console.error('Reconnection failed:', error);
                handleConnectionFailure();
            }
        }, 2000);
    } else {
        connectionState = CONNECTION_STATES.FAILED;
        showMessage('Connection failed after multiple attempts', 'error');
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