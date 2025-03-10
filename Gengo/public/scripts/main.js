let currentState = 'idle';
let currentRoom = null;
let agoraVideo = null;
let socket = null;

// Initialize Agora Video client
const initializeAgoraVideo = () => {
    agoraVideo = new AgoraClient();
};

async function startVideoCall(language, role) {
    try {
        // Check permissions first
        try {
            await agoraVideo.checkPermissions();
        } catch (error) {
            showMessage(error.message, 'error');
            return;
        }

        updateState('connecting');
        showMessage('Connecting to server...', 'info');

        // Initialize socket if not already connected
        if (!socket) {
            socket = io();
            setupSocketListeners();
        }

        // Add loading state to connect button
        const connectButton = document.getElementById('connect');
        connectButton.classList.add('loading');

        // Join the matching queue
        socket.emit('join', { language, role });

    } catch (error) {
        console.error('Error starting video call:', error);
        showMessage('Failed to start video call. Please try again.', 'error');
        updateState('idle');
        
        // Remove loading state from connect button
        const connectButton = document.getElementById('connect');
        connectButton.classList.remove('loading');
    }
}

function setupSocketListeners() {
    socket.on('match-found', async ({ room, role, peerRole }) => {
        currentRoom = room;
        showMessage('Match found! Connecting to video...', 'success');
        
        try {
            // Get Agora app ID
            const response = await fetch('/api/agora-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identity: `${role}-${Date.now()}`,
                    room: currentRoom
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get token');
            }
            
            if (!data.appId) {
                throw new Error('App ID not received from server');
            }
            
            showMessage('Credentials received, connecting to room...', 'info');
            
            try {
                // Connect to Agora room
                await agoraVideo.connectToRoom(
                    data.appId,
                    currentRoom,
                    document.getElementById('localVideo'),
                    document.getElementById('remoteVideo')
                );
                
                updateState('connected');
                setupUIControls();
                showMessage('Successfully connected to video room', 'success');
            } catch (videoError) {
                console.error('Video connection failed:', videoError);
                throw new Error('Failed to establish video connection: ' + videoError.message);
            }
            
        } catch (error) {
            console.error('Connection failed:', error);
            showMessage(error.message || 'Failed to establish video connection', 'error');
            // Emit error before resetting
            if (socket) {
                socket.emit('error', { error: error.message });
            }
            resetVideoCall();
        }
    });

    socket.on('waiting', () => {
        updateState('waiting');
        showMessage('Waiting for a match...', 'info');
    });

    socket.on('room-closed', ({ reason }) => {
        showMessage(`Room closed: ${reason}`, 'warning');
        resetVideoCall();
    });

    socket.on('error', ({ message }) => {
        showMessage(message, 'error');
        resetVideoCall();
    });

    // Handle socket disconnection
    socket.on('disconnect', () => {
        showMessage('Disconnected from server', 'warning');
        resetVideoCall();
    });

    // Handle socket reconnection
    socket.on('reconnect', () => {
        showMessage('Reconnected to server', 'success');
        // If we were in a room, we need to rejoin
        if (currentRoom) {
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            socket.emit('join', { language, role, room: currentRoom });
        }
    });
}

function setupUIControls() {
    const muteButton = document.getElementById('muteAudio');
    const hideVideoButton = document.getElementById('hideVideo');
    const leaveButton = document.getElementById('leave');

    // Remove any existing listeners
    muteButton?.removeEventListener('click', handleMuteClick);
    hideVideoButton?.removeEventListener('click', handleVideoClick);
    leaveButton?.removeEventListener('click', handleLeaveClick);

    // Add new listeners
    muteButton?.addEventListener('click', handleMuteClick);
    hideVideoButton?.addEventListener('click', handleVideoClick);
    leaveButton?.addEventListener('click', handleLeaveClick);
}

function handleMuteClick() {
    agoraVideo.toggleAudio();
}

function handleVideoClick() {
    agoraVideo.toggleVideo();
}

function handleLeaveClick() {
    // Show confirmation dialog
    if (confirm('Are you sure you want to leave the call?')) {
        resetVideoCall();
    }
}

function resetVideoCall() {
    if (agoraVideo) {
        agoraVideo.disconnect();
    }
    
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    currentRoom = null;
    updateState('idle');

    // Reset UI elements
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    // Remove loading state from connect button
    const connectButton = document.getElementById('connect');
    connectButton.classList.remove('loading');

    // Reset video containers and controls
    document.querySelector('.video-container').style.display = 'none';
    document.querySelector('.video-controls').style.display = 'none';
    document.querySelector('.selection-container').style.display = 'flex';

    // Remove any quality indicators or status messages
    const qualityIndicator = document.querySelector('.quality-indicator');
    if (qualityIndicator) qualityIndicator.remove();
}

function updateState(newState) {
    currentState = newState;
    document.body.setAttribute('data-state', newState);
    
    const roleElement = document.getElementById('role');
    if (roleElement) {
        document.body.setAttribute('data-role', roleElement.value);
    }
    
    updateUI(newState);
}

function updateUI(state) {
    const videoControls = document.querySelector('.video-controls');
    const connectButton = document.getElementById('connect');
    const selectionContainer = document.querySelector('.selection-container');
    const videoContainer = document.querySelector('.video-container');
    const loadingIndicator = document.getElementById('loadingIndicator');

    switch (state) {
        case 'idle':
            connectButton.textContent = 'Connect';
            connectButton.disabled = false;
            connectButton.classList.remove('loading');
            selectionContainer.style.display = 'flex';
            videoContainer.style.display = 'none';
            videoControls.style.display = 'none';
            loadingIndicator.classList.add('hidden');
            break;
            
        case 'waiting':
            connectButton.textContent = 'Waiting...';
            connectButton.disabled = true;
            connectButton.classList.add('loading');
            loadingIndicator.classList.remove('hidden');
            break;
            
        case 'connecting':
            connectButton.textContent = 'Connecting...';
            connectButton.disabled = true;
            connectButton.classList.add('loading');
            selectionContainer.style.display = 'none';
            videoContainer.style.display = 'none';
            videoControls.style.display = 'none';
            loadingIndicator.classList.remove('hidden');
            break;
            
        case 'connected':
            connectButton.textContent = 'Connected';
            connectButton.disabled = true;
            connectButton.classList.remove('loading');
            selectionContainer.style.display = 'none';
            videoContainer.style.display = 'grid';
            videoControls.style.display = 'flex';
            loadingIndicator.classList.add('hidden');
            break;
    }
}

function showMessage(message, type = 'info') {
    // Remove any existing messages of the same type
    const existingMessages = document.querySelectorAll(`.message.${type}-message`);
    existingMessages.forEach(msg => msg.remove());

    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);

    // Auto-remove after delay, except for error messages
    if (type !== 'error') {
        setTimeout(() => {
            if (messageDiv.parentElement) {
                messageDiv.remove();
            }
        }, 5000);
    } else {
        // For error messages, add a close button
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.className = 'message-close';
        closeButton.onclick = () => messageDiv.remove();
        messageDiv.appendChild(closeButton);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeAgoraVideo();
    
    const connectButton = document.getElementById('connect');
    connectButton?.addEventListener('click', async () => {
        const language = document.getElementById('language').value;
        const role = document.getElementById('role').value;
        await startVideoCall(language, role);
    });

    // Add input validation
    const inputs = document.querySelectorAll('select');
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            const connectButton = document.getElementById('connect');
            const isValid = Array.from(inputs).every(input => input.value);
            connectButton.disabled = !isValid;
        });
    });
});
