let peerConnection;
let localStream;
let remoteStream;
let socket;
let currentRoom;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Only initialize WebRTC functionality on main.html
if (window.location.pathname.includes('main.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        const connectButton = document.getElementById('connect');
        const leaveButton = document.getElementById('leave');
        const videoContainer = document.getElementById('video-container');
        const selectionContainer = document.getElementById('selection-container');

        if (!connectButton || !videoContainer || !selectionContainer) {
            console.error('Required elements not found');
            return;
        }

        console.log('Connect button found');
        connectButton.addEventListener('click', async () => {
            console.log('Connect button clicked');
            try {
                const language = document.getElementById('language')?.value;
                const role = document.getElementById('role')?.value;
                
                if (!language || !role) {
                    showMessage('Please select language and role', 'warning');
                    return;
                }

                // Disable controls before starting call
                connectButton.disabled = true;
                document.getElementById('language').disabled = true;
                document.getElementById('role').disabled = true;

                await startCall();
                
                selectionContainer.style.display = 'none';
                videoContainer.style.display = 'block';
            } catch (error) {
                console.error('Error in click handler:', error);
                handleConnectionError();
            }
        });

        if (leaveButton) {
            leaveButton.addEventListener('click', () => {
                cleanup();
                selectionContainer.style.display = 'block';
                videoContainer.style.display = 'none';
            });
        }
    });
}

function initializeSocket() {
    try {
        console.log('Initializing socket connection');
        const socketUrl = process.env.NODE_ENV === 'production' 
            ? 'https://www.gengo.live'
            : 'http://localhost:3000';

        const socketIo = io(socketUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000,
            withCredentials: true,
            autoConnect: true,
            forceNew: true,
            extraHeaders: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });

        socketIo.on('connect', () => {
            console.log('Socket connected successfully:', socketIo.id);
            const language = document.getElementById('language')?.value;
            const role = document.getElementById('role')?.value;
            
            if (language && role) {
                socketIo.emit('join', { language, role });
            }
        });

        socketIo.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            if (error.message.includes('xhr poll error')) {
                console.log('Falling back to websocket only');
                socketIo.io.opts.transports = ['websocket'];
                socketIo.connect();
            }
            handleConnectionError();
        });

        socketIo.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            if (reason === 'io server disconnect') {
                socketIo.connect();
            }
        });

        socketIo.on('error', (error) => {
            console.error('Socket error:', error);
            handleConnectionError();
        });

        return socketIo;
    } catch (error) {
        console.error('Socket initialization error:', error);
        handleConnectionError();
        return null;
    }
}

// Rest of your existing functions remain the same...