import { configuration, startLocalStream, createPeerConnection, monitorConnectionQuality } from './webrtc.js';

let socket = null;
let currentRoom = null;
let peerConnection = null;
let localStream = null;
const videoContainer = document.querySelector('.video-container');

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const leaveButton = document.getElementById('leave');
    const languageSelect = document.getElementById('language');
    const roleSelect = document.getElementById('role');

    if (connectButton) {
        connectButton.addEventListener('click', async () => {
            const language = languageSelect.value;
            const role = roleSelect.value;
            
            if (!language || !role) {
                showMessage('Please select both language and role', 'error');
                return;
            }

            try {
                // First get local media stream
                localStream = await startLocalStream();
                
                // Then start the call
                await startVideoCall(language, role);
                
                // Show video container and hide selection
                document.querySelector('.selection-container').style.display = 'none';
                videoContainer.style.display = 'flex';
            } catch (error) {
                console.error('Failed to start call:', error);
                showMessage(error.message || 'Failed to start call. Please try again.', 'error');
                cleanup();
            }
        });
    }

    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            cleanup();
            // Show selection and hide video container
            document.querySelector('.selection-container').style.display = 'block';
            videoContainer.style.display = 'none';
        });
    }
});

function initializeSocket() {
    if (socket) {
        return socket;
    }

    try {
        const socketUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000'
            : window.location.origin;

        console.log('Connecting to socket.io server at:', socketUrl);
        
        socket = io(socketUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            autoConnect: false
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            showMessage('Connection error. Please check your internet connection.', 'error');
        });

        socket.on('connect', () => {
            console.log('Socket connected successfully');
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

async function setupPeerConnection() {
    try {
        peerConnection = await createPeerConnection(configuration);
        
        // Add local stream tracks to peer connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket && currentRoom) {
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    room: currentRoom
                });
            }
        };

        // Monitor connection quality
        monitorConnectionQuality(peerConnection, (quality) => {
            if (socket && currentRoom) {
                socket.emit('connection-quality', { room: currentRoom, quality });
            }
        });

        return peerConnection;
    } catch (error) {
        console.error('Error setting up peer connection:', error);
        throw error;
    }
}

function setupSocketListeners(socket) {
    if (!socket) {
        console.error('Cannot setup listeners: socket is undefined');
        return;
    }

    socket.on('match-found', async (data) => {
        try {
            currentRoom = data.room;
            showMessage('Match found! Connecting...', 'success');
            
            // Set up peer connection when match is found
            await setupPeerConnection();
            
            // Create and send offer if we're the initiator
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            socket.emit('offer', {
                offer: peerConnection.localDescription,
                room: currentRoom
            });
        } catch (error) {
            console.error('Error in match-found handler:', error);
            showMessage('Failed to setup video call', 'error');
            cleanup();
        }
    });

    socket.on('offer', async (data) => {
        try {
            if (!peerConnection) {
                await setupPeerConnection();
            }
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('answer', {
                answer: peerConnection.localDescription,
                room: data.room
            });
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Failed to process connection offer', 'error');
            cleanup();
        }
    });

    socket.on('answer', async (data) => {
        try {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Failed to process connection answer', 'error');
            cleanup();
        }
    });

    socket.on('ice-candidate', async (data) => {
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    });

    socket.on('peer-disconnected', () => {
        showMessage('Your partner has disconnected', 'warning');
        cleanup();
    });

    socket.on('waiting', (data) => {
        showMessage('Waiting for a match...', 'info');
        const queuePosition = data.position;
        if (queuePosition) {
            showMessage(`Queue position: ${queuePosition}`, 'info');
        }
    });
}

async function startVideoCall(language, role) {
    try {
        socket = initializeSocket();
        if (!socket) {
            throw new Error('Failed to initialize connection');
        }

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

        socket.emit('join', { language, role });
    } catch (error) {
        console.error('Error starting video call:', error);
        throw error;
    }
}

function cleanup() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    currentRoom = null;

    // Reset video elements
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        video.srcObject = null;
    });
}

function showMessage(message, type = 'info') {
    console.log(`${type}: ${message}`);
    // You can implement a UI notification system here
}