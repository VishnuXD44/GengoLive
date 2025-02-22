let socket = null;

// Initialize socket only when needed
function initializeSocket() {
    if (socket) {
        return socket; // Return existing socket if already initialized
    }

    try {
        const socketUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000'  // Development server
            : window.location.origin;   // Production server

        console.log('Connecting to socket.io server at:', socketUrl);
        
        socket = io(socketUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            autoConnect: false // Prevent automatic connection
        });

        // Debug socket connection
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            showMessage('Connection error. Please check your internet connection.', 'error');
        });

        socket.on('connect', () => {
            console.log('Socket connected successfully');
            // Only set up listeners after successful connection
            setupSocketListeners(socket);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            showMessage('Disconnected from server. Attempting to reconnect...', 'warning');
        });

        return socket;
    } catch (error) {
        console.error('Failed to initialize socket:', error);
        showMessage('Failed to initialize connection. Please try again.', 'error');
        return null;
    }
}

// Move setupSocketListeners to take socket as parameter
function setupSocketListeners(socket) {
    if (!socket) {
        console.error('Cannot setup listeners: socket is undefined');
        return;
    }

    socket.on('match-found', async (data) => {
        currentRoom = data.room;
        // ... rest of match-found handler
    });

    socket.on('offer', async (data) => {
        try {
            // ... offer handling code
            socket.emit('answer', {
                answer: peerConnection.localDescription,
                room: data.room
            });
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Failed to process connection offer', 'error');
            resetVideoCall();
        }
    });

    socket.on('answer', async (data) => {
        try {
            // ... answer handling code
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Failed to process connection answer', 'error');
            resetVideoCall();
        }
    });

    socket.on('ice-candidate', async (data) => {
        try {
            // ... ice-candidate handling code
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    });

    socket.on('peer-disconnected', () => {
        showMessage('Your partner has disconnected', 'warning');
        resetVideoCall();
    });

    socket.on('waiting', (data) => {
        const queuePosition = videoContainer.querySelector('.queue-position');
        if (queuePosition) {
            queuePosition.textContent = `Queue position: ${data.position}`;
        }
    });
}

// Modify startVideoCall to initialize socket only when needed
async function startVideoCall(language, role) {
    try {
        // Initialize socket only when starting a call
        socket = initializeSocket();
        if (!socket) {
            showMessage('Failed to initialize connection. Please try again.', 'error');
            return;
        }

        // Connect only if not already connected
        if (!socket.connected) {
            showMessage('Connecting to server...', 'info');
            socket.connect();
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
                socket.once('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                socket.once('connect_error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        }

        // Join the room
        socket.emit('join', { language, role });

    } catch (error) {
        console.error('Error starting video call:', error);
        showMessage('Failed to start video call. Please try again.', 'error');
    }
}

// Add cleanup function
function cleanup() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    // Add any other cleanup needed
}