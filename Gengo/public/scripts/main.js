// Just use the global variables
let currentState = 'idle';
let currentRoom = null;
let agoraVideo = null;
let socket = null;

// Initialize Agora Video client
const initializeAgoraVideo = () => {
    agoraVideo = new window.AgoraClient();
};

// Update the startVideoCall function
async function startVideoCall(language, role) {
    try {
        // Check permissions first
        try {
            await agoraVideo.checkPermissions();
        } catch (error) {
            console.error('Permission error:', error);
            return;
        }

        updateState('connecting');

        // Initialize socket if not already connected
        if (!socket) {
            socket = io();
            setupSocketListeners();
        }

        // Add loading state to connect button
        const connectButton = document.getElementById('connect');
        connectButton.classList.add('loading');

        // Show waiting indicator
        showWaitingIndicator();

        // Join the matching queue
        socket.emit('join', { language, role });

    } catch (error) {
        console.error('Error starting video call:', error);
        updateState('idle');
        
        // Remove loading state from connect button
        const connectButton = document.getElementById('connect');
        connectButton.classList.remove('loading');

        // Hide waiting indicator
        hideWaitingIndicator();
    }
}

// Update the setupSocketListeners function
function setupSocketListeners() {
    socket.on('match-found', async ({ room, role, peerRole }) => {
        currentRoom = room;
        
        // Hide waiting indicator
        hideWaitingIndicator();
        
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
            
            if (!data.appId || !data.token) {
                throw new Error('App ID or token not received from server');
            }
            
            // Inside your match-found handler, right before calling connectToRoom
            console.log('Connecting with credentials:', {
                appId: data.appId.substring(0, 3) + '...', // Only show part of the ID for security
                hasToken: !!data.token,
                tokenLength: data.token ? data.token.length : 0,
                uid: data.uid,
                channel: currentRoom
            });
            
            try {
                // Connect to Agora room with token and UID
                await agoraVideo.connectToRoom(
                    data.appId,
                    data.token,
                    currentRoom,
                    document.getElementById('localVideo'),
                    document.getElementById('remoteVideo'),
                    data.uid  // Pass the UID from the server
                );
                
                updateState('connected');
                setupUIControls();
                
                // Initialize content monitoring for local video
                await initContentMonitoring();
                
            } catch (videoError) {
                console.error('Video connection failed:', videoError);
                throw new Error('Failed to establish video connection: ' + videoError.message);
            }
            
        } catch (error) {
            console.error('Connection failed:', error);
            // Emit error before resetting
            if (socket) {
                socket.emit('error', { error: error.message });
            }
            resetVideoCall();
        }
    });

    socket.on('waiting', () => {
        updateState('waiting');
        showWaitingIndicator();
    });

    // Update other socket event handlers to hide the waiting indicator
    socket.on('room-closed', ({ reason }) => {
        hideWaitingIndicator();
        resetVideoCall();
    });

    socket.on('error', ({ message }) => {
        hideWaitingIndicator();
        resetVideoCall();
    });

    socket.on('disconnect', () => {
        hideWaitingIndicator();
        resetVideoCall();
    });

    // Handle socket reconnection
    socket.on('reconnect', () => {
        // If we were in a room, we need to rejoin
        if (currentRoom) {
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            socket.emit('join', { language, role, room: currentRoom });
        }
    });
}

// Update the resetVideoCall function
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

    // Hide waiting indicator
    hideWaitingIndicator();
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

// Add this function to show the waiting indicator
function showWaitingIndicator() {
    // Remove any existing waiting indicator
    hideWaitingIndicator();
    
    const waitingIndicator = document.createElement('div');
    waitingIndicator.className = 'waiting-indicator';
    waitingIndicator.innerHTML = `
        <div class="spinner"></div>
        <p>Waiting for a match...</p>
        <p class="queue-status">This may take a few moments</p>
    `;
    document.body.appendChild(waitingIndicator);
}

// Add this function to hide the waiting indicator
function hideWaitingIndicator() {
    const waitingIndicator = document.querySelector('.waiting-indicator');
    if (waitingIndicator) {
        waitingIndicator.remove();
    }
}

// Update the showMessage function to be more compact
function showMessage(message, type = 'info') {
    // Remove any existing messages of the same type
    const existingMessages = document.querySelectorAll(`.message.${type}-message`);
    existingMessages.forEach(msg => msg.remove());

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    
    // Main message text
    const messageText = document.createElement('span');
    messageText.textContent = message;
    messageDiv.appendChild(messageText);
    
    // Add close button for all messages
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.className = 'message-close';
    closeButton.onclick = () => messageDiv.remove();
    messageDiv.appendChild(closeButton);
    
    document.body.appendChild(messageDiv);

    // Auto-remove after a short delay
    const timeout = type === 'error' ? 5000 : (type === 'warning' ? 4000 : 3000);
    setTimeout(() => {
        if (messageDiv.parentElement) {
            messageDiv.remove();
        }
    }, timeout);
}

// Initialize content monitoring for local video
async function initContentMonitoring() {
    try {
        // Only start monitoring after local video is ready and permissions granted
        const localVideo = document.getElementById('local-video');
        if (!localVideo || !localVideo.srcObject) {
            return;
        }
        
        // Create content monitor with appropriate callbacks
        const contentMonitor = new ContentMonitor({
            checkInterval: 3000,  // Check every 3 seconds
            warningThreshold: 0.7,
            banThreshold: 0.85,
            consecutiveThreshold: 3,
            onWarning: (data) => {
                console.warn('Content warning:', data.message);
            },
            onBanned: (data) => {
                console.error('Content ban:', data.message);
                showContentBanMessage(data);
                leaveCall();
            },
            onError: (error) => {
                console.error('Content monitoring error:', error);
            }
        });
        
        // Initialize the monitor with the video element
        await contentMonitor.init(localVideo);
        
        // Start monitoring
        contentMonitor.startMonitoring();
        
        // Store reference to stop later
        window.contentMonitor = contentMonitor;
    } catch (error) {
        console.error('Failed to initialize content monitoring:', error);
    }
}

// Show content ban message
function showContentBanMessage(data) {
    const banContainer = document.createElement('div');
    banContainer.className = 'content-ban-message';
    
    const banHeader = document.createElement('div');
    banHeader.className = 'ban-header';
    banHeader.textContent = 'Content Policy Violation';
    
    const banReason = document.createElement('div');
    banReason.className = 'ban-reason';
    banReason.textContent = data.message;
    
    const banDetail = document.createElement('div');
    banDetail.className = 'ban-detail';
    banDetail.textContent = `You can try again after ${data.until.toLocaleTimeString()}.`;
    
    const dismissButton = document.createElement('button');
    dismissButton.id = 'dismiss-ban';
    dismissButton.textContent = 'Dismiss';
    dismissButton.addEventListener('click', () => {
        document.body.removeChild(banContainer);
    });
    
    banContainer.appendChild(banHeader);
    banContainer.appendChild(banReason);
    banContainer.appendChild(banDetail);
    banContainer.appendChild(dismissButton);
    
    document.body.appendChild(banContainer);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize your app
    window.agoraClient = new AgoraClient();
    
    // Your existing initialization code...
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
