// Just use the global variables
let currentState = 'idle';
let currentRoom = null;
let agoraVideo = null;
let socket = null;

// Initialize Agora Video client
const initializeAgoraVideo = () => {
    try {
        if (!process.env.AGORA_APP_ID) {
            throw new Error('Agora App ID is not configured');
        }
        agoraVideo = new window.AgoraClient();
    } catch (error) {
        console.error('Failed to initialize Agora client:', error);
        showMessage('Failed to initialize video chat. Please try again later.', 'error');
    }
};

// Update the startVideoCall function
async function startVideoCall(language, role) {
    try {
        // Check permissions first
        try {
            await agoraVideo.checkPermissions();
        } catch (error) {
            console.error('Permission error:', error);
            showMessage('Camera or microphone permission denied', 'error');
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
        connectButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Connecting...</span>';
        connectButton.disabled = true;

        // Show waiting indicator
        showWaitingIndicator();

        // Join the matching queue
        socket.emit('join', { language, role });

    } catch (error) {
        console.error('Error starting video call:', error);
        updateState('idle');
        
        // Reset connect button
        const connectButton = document.getElementById('connect');
        connectButton.innerHTML = '<i class="fas fa-video"></i><span>Start Session</span>';
        connectButton.disabled = false;

        // Hide waiting indicator
        hideWaitingIndicator();
        
        // Show error message
        showMessage('Failed to start video call', 'error');
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
                    room: currentRoom,
                    appId: process.env.AGORA_APP_ID
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

function resetVideoCall() {
    // First, cleanup the video streams
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    if (localVideo && localVideo.srcObject) {
        localVideo.srcObject.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
    }
    
    if (remoteVideo && remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }

    // Disconnect from Agora
    if (agoraVideo) {
        agoraVideo.disconnect();
    }
    
    // Disconnect socket
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    // Reset state
    currentRoom = null;
    updateState('idle');

    // Reset UI elements properly
    const videoContainer = document.querySelector('.video-container');
    const videoControls = document.querySelector('.video-controls');
    const selectionContainer = document.querySelector('.selection-container');
    
    if (videoContainer) {
        videoContainer.style.display = 'none';
        // Clear any lingering video elements
        videoContainer.innerHTML = `
            <div class="video-wrapper" data-role="you">
                <video id="localVideo" autoplay muted playsinline></video>
            </div>
            <div class="video-wrapper" data-role="partner">
                <video id="remoteVideo" autoplay playsinline></video>
            </div>
        `;
    }
    
    if (videoControls) {
        videoControls.style.display = 'none';
    }
    
    if (selectionContainer) {
        selectionContainer.style.display = 'block';
    }

    // Reset buttons to initial state
    const muteButton = document.getElementById('muteAudio');
    const hideVideoButton = document.getElementById('hideVideo');
    if (muteButton) muteButton.classList.remove('active');
    if (hideVideoButton) hideVideoButton.classList.remove('active');

    // Remove any status messages
    const statusBar = document.getElementById('status-bar');
    if (statusBar) statusBar.style.display = 'none';

    // Reset connect button
    const connectButton = document.getElementById('connect');
    if (connectButton) {
        connectButton.textContent = 'Connect';
        connectButton.disabled = false;
        connectButton.classList.remove('loading');
    }
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

// Function to show waiting indicator
function showWaitingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.classList.remove('hidden');
    }
}

// Function to hide waiting indicator
function hideWaitingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.classList.add('hidden');
    }
}

// Function to show status messages
function showMessage(message, type = 'info') {
    const statusBar = document.getElementById('status-bar');
    const statusMessage = statusBar.querySelector('.status-message');
    
    if (statusBar && statusMessage) {
        statusMessage.textContent = message;
        statusBar.className = `status-bar ${type}`;
        statusBar.classList.add('show');
        
        // Hide after 5 seconds
        setTimeout(() => {
            statusBar.classList.remove('show');
        }, 5000);
    }
}

// Initialize content monitoring for local video
async function initContentMonitoring() {
    try {
        // Only start monitoring after local video is ready and permissions granted
        const localVideo = document.getElementById('localVideo');
        if (!localVideo || !localVideo.srcObject) {
            return;
        }
        
        // Create content monitor with simplified callbacks
        const contentMonitor = new ContentMonitor({
            checkInterval: 3000,  // Check every 3 seconds
            banThreshold: 0.85,
            consecutiveThreshold: 3,
            onBanned: (data) => {
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

// Show content ban message in the status bar
function showContentBanMessage(data) {
    const statusBar = document.getElementById('status-bar');
    if (statusBar) {
        statusBar.textContent = `Content Policy Violation: ${data.message}`;
        statusBar.className = 'status-bar error';
        statusBar.style.display = 'block';
    }
    resetVideoCall();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize your app
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
