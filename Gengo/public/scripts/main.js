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
        // At the top of createPeerConnection function
        const config = {
            iceServers: [
                {
                    urls: [
                        'stun:stun1.l.google.com:19302',
                        'stun:stun2.l.google.com:19302',
                        'stun:stun3.l.google.com:19302',
                        'stun:stun4.l.google.com:19302'
                    ]
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ],
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceCandidatePoolSize: 1
        };

        peerConnection = new RTCPeerConnection(config);

        // Buffer for ICE candidates
        const pendingCandidates = [];
        let candidateTimeout = null;

        // Handle ICE candidates with buffering
        peerConnection.onicecandidate = (event) => {
            if (!event.candidate) {
                // End of candidates
                if (pendingCandidates.length > 0 && currentRoom) {
                    console.log(`Sending ${pendingCandidates.length} buffered candidates`);
                    pendingCandidates.forEach(candidate => {
                        socket.emit('ice-candidate', {
                            candidate,
                            room: currentRoom
                        });
                    });
                    pendingCandidates.length = 0;
                }
                return;
            }

            if (currentRoom) {
                // Buffer the candidate
                pendingCandidates.push(event.candidate);

                // Clear existing timeout
                if (candidateTimeout) {
                    clearTimeout(candidateTimeout);
                }

                // Set new timeout to send candidates
                candidateTimeout = setTimeout(() => {
                    if (pendingCandidates.length > 0) {
                        console.log(`Sending ${pendingCandidates.length} buffered candidates`);
                        pendingCandidates.forEach(candidate => {
                            socket.emit('ice-candidate', {
                                candidate,
                                room: currentRoom
                            });
                        });
                        pendingCandidates.length = 0;
                    }
                }, 100); // Wait 100ms to batch candidates
            }
        };

        // Monitor ICE gathering progress
        peerConnection.onicegatheringstatechange = () => {
            console.log('ICE Gathering State:', peerConnection.iceGatheringState);
            if (peerConnection.iceGatheringState === 'complete') {
                console.log('ICE gathering completed naturally');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
            
            switch (peerConnection.iceConnectionState) {
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
                    // Try reconnecting
                    setTimeout(() => {
                        if (peerConnection.iceConnectionState === 'disconnected') {
                            peerConnection.restartIce();
                        }
                    }, 2000);
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
                
                // If we already have a remote stream, check if this is a new stream
                if (remoteStream && remoteStream.id !== event.streams[0].id) {
                    console.log('Cleaning up old remote stream:', remoteStream.id);
                    remoteStream.getTracks().forEach(track => track.stop());
                }
                
                remoteStream = event.streams[0];
                
                // Log stream information
                console.log('Remote stream ID:', remoteStream.id);
                console.log('Remote stream tracks:', remoteStream.getTracks().map(track => ({
                    kind: track.kind,
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState
                })));

                // Wait for both audio and video tracks before handling stream
                const tracks = remoteStream.getTracks();
                const hasVideo = tracks.some(track => track.kind === 'video');
                const hasAudio = tracks.some(track => track.kind === 'audio');

                if (hasVideo && hasAudio) {
                    console.log('Both audio and video tracks received, handling stream');
                    try {
                        await handleRemoteStream(remoteStream);
                    } catch (error) {
                        console.error('Error handling remote stream:', error);
                        // Try one more time after a delay
                        setTimeout(async () => {
                            try {
                                await handleRemoteStream(remoteStream);
                            } catch (retryError) {
                                console.error('Retry handling remote stream failed:', retryError);
                            }
                        }, 2000);
                    }
                } else {
                    console.log('Waiting for all tracks...', { hasVideo, hasAudio });
                }
            } else {
                console.warn('No stream received with track');
            }

            // Monitor track state changes
            event.track.onended = () => {
                console.log('Remote track ended:', event.track.kind);
                showMessage(`Remote ${event.track.kind} ended`, 'warning');
            };

            event.track.onmute = () => {
                console.log('Remote track muted:', event.track.kind);
                if (event.track.kind === 'video') {
                    showMessage('Remote video paused', 'info');
                }
            };

            event.track.onunmute = () => {
                console.log('Remote track unmuted:', event.track.kind);
                if (event.track.kind === 'video') {
                    showMessage('Remote video resumed', 'info');
                }
            };

            // Monitor track settings changes
            const settings = event.track.getSettings();
            event.track.onended = () => {
                const newSettings = event.track.getSettings();
                console.log(`Track settings changed for ${event.track.kind}:`, {
                    old: settings,
                    new: newSettings
                });
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

        monitorConnectionState();

        return peerConnection;
    } catch (error) {
        console.error('Error in createPeerConnection:', error);
        showMessage('Failed to create connection', 'error');
        throw error;
    }
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

    const iceCandidatesBuffer = [];

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
        remoteVideo.srcObject = stream;
        
        // Pre-load stream in temporary element
        const tempVideo = document.createElement('video');
        tempVideo.srcObject = stream;
        tempVideo.muted = true;
        
        await Promise.race([
            new Promise(resolve => {
                tempVideo.onloadedmetadata = resolve;
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Metadata loading timeout')), 15000)
            )
        ]);

        // Multiple play attempts
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await remoteVideo.play();
                console.log('Remote video playback started');
                break;
            } catch (error) {
                if (error.name === 'NotAllowedError' || attempt === 3) {
                    addPlayButton(remoteVideo);
                    break;
                }
                console.warn(`Play attempt ${attempt} failed:`, error);
                if (attempt === 3) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } catch (error) {
        console.error('Error handling remote stream:', error);
        showMessage('Video connection issues. Click to play.', 'warning');
        addPlayButton(remoteVideo);
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
        if (!peerConnection) return;
        
        console.log(`Connection state: ${peerConnection.connectionState}`);
        
        if (peerConnection.connectionState === 'failed') {
            console.log('Connection failed - attempting reconnection');
            handleConnectionRetry();
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