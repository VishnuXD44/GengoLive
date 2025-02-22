let currentState = 'idle';
let currentRoom = null;
let twilioVideo = null;
let socket = null;

// Initialize Twilio Video client
const initializeTwilioVideo = () => {
    twilioVideo = new TwilioVideoClient();
};

async function startVideoCall(language, role) {
    try {
        updateState('connecting');
        showMessage('Connecting to server...', 'info');

        // Initialize socket if not already connected
        if (!socket) {
            socket = io();
            setupSocketListeners();
        }

        // Join the matching queue
        socket.emit('join', { language, role });

    } catch (error) {
        console.error('Error starting video call:', error);
        showMessage('Failed to start video call. Please try again.', 'error');
        updateState('idle');
    }
}

function setupSocketListeners() {
    socket.on('match-found', async ({ room, role, peerRole }) => {
        currentRoom = room;
        showMessage('Match found! Connecting to video...', 'success');
        
        try {
            // Get Twilio token
            const response = await fetch('/api/token', {
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
            
            if (!data.token) {
                throw new Error('Token not received from server');
            }
            
            showMessage('Token received, connecting to room...', 'info');
            
            try {
                // Connect to Twilio room
                await twilioVideo.connectToRoom(
                    data.token,
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
            resetVideoCall();
            socket.emit('error', { error: error.message });
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
}

function setupUIControls() {
    const muteButton = document.getElementById('muteAudio');
    const hideVideoButton = document.getElementById('hideVideo');
    const leaveButton = document.getElementById('leave');

    muteButton?.addEventListener('click', () => {
        twilioVideo.toggleAudio();
    });

    hideVideoButton?.addEventListener('click', () => {
        twilioVideo.toggleVideo();
    });

    leaveButton?.addEventListener('click', () => {
        resetVideoCall();
    });
}

function resetVideoCall() {
    if (twilioVideo) {
        twilioVideo.disconnect();
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

    document.querySelector('.video-container').style.display = 'none';
    document.querySelector('.selection-container').style.display = 'block';
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

    switch (state) {
        case 'idle':
            connectButton.textContent = 'Connect';
            connectButton.disabled = false;
            selectionContainer.style.display = 'block';
            videoContainer.style.display = 'none';
            videoControls.style.display = 'none';
            break;
        case 'waiting':
            connectButton.textContent = 'Waiting...';
            connectButton.disabled = true;
            break;
        case 'connecting':
            connectButton.textContent = 'Connecting...';
            connectButton.disabled = true;
            selectionContainer.style.display = 'none';
            videoContainer.style.display = 'grid';
            videoControls.style.display = 'flex';
            break;
        case 'connected':
            connectButton.textContent = 'Connected';
            connectButton.disabled = true;
            selectionContainer.style.display = 'none';
            videoContainer.style.display = 'grid';
            videoControls.style.display = 'flex';
            break;
    }
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}-message`;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 5000);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeTwilioVideo();
    
    const connectButton = document.getElementById('connect');
    connectButton?.addEventListener('click', () => {
        const language = document.getElementById('language').value;
        const role = document.getElementById('role').value;
        startVideoCall(language, role);
    });
});
