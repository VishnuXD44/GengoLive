import { configuration, startLocalStream } from './webrtc.js';

// Initialize socket connection
const socket = io(window.location.origin, {
    path: '/socket.io/',
    transports: ['websocket']
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
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
            
            if (['failed', 'disconnected', 'closed'].includes(peerConnection.iceConnectionState)) {
                console.log('Connection state changed to:', peerConnection.iceConnectionState);
                resetVideoCall();
                showMessage('Connection lost', 'error');
            }
        };

        peerConnection.ontrack = async (event) => {
            console.log('Received remote track:', event.track.kind);

            if (event.streams && event.streams[0]) {
                console.log('Setting remote stream from ontrack');
                remoteStream = event.streams[0];
                await handleRemoteStream(remoteStream);
            }
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

                console.log('Creating answer');
                const answer = await peerConnection.createAnswer();
                
                console.log('Setting local description');
                await peerConnection.setLocalDescription(answer);

                console.log('Sending answer to peer');
                socket.emit('answer', { answer, room: currentRoom });
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
            }
        } catch (error) {
            console.error('Error in answer handler:', error);
            showMessage('Failed to establish connection', 'error');
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

            if (peerConnection.signalingState !== 'closed') {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('Added ICE candidate successfully');
            }
        } catch (error) {
            // Only log error if it's not an InvalidStateError
            if (error.name !== 'InvalidStateError') {
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
    const remoteVideo = document.getElementById('remoteVideo');
    
    try {
        // Wait for any existing stream to be properly cleaned up
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject = null;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Set up new stream
        remoteVideo.muted = false;
        
        // Create a promise to handle the loadedmetadata event
        const metadataLoaded = new Promise((resolve, reject) => {
            remoteVideo.onloadedmetadata = () => resolve();
            remoteVideo.onerror = (e) => reject(e);
        });

        // Set the stream
        remoteVideo.srcObject = stream;

        // Wait for metadata to load
        try {
            await metadataLoaded;
            console.log('Video metadata loaded successfully');
        } catch (error) {
            console.error('Error loading video metadata:', error);
            throw error;
        }

        // Attempt to play the video
        try {
            // Use a play promise to handle autoplay restrictions
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                await playPromise;
                console.log('Remote video playback started successfully');
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
        await startLocalStream();
        peerConnection = await createPeerConnection();
        // Setup media handling...
    } catch (error) {
        console.error('Call initialization failed:', error);
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