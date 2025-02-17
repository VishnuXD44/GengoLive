// ============ GLOBAL VARIABLES AND CONFIGURATION ============
let localStream;
let remoteStream;
let peerConnection;
let socket;
let currentRoom;
let iceCandidatesQueue = [];

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// ============ MEDIA HANDLING FUNCTIONS ============
async function checkMediaPermissions() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Media devices not supported');
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('Permission check error:', error);
        showMessage('Camera and microphone access required', 'error');
        return false;
    }
}

// ============ WEBRTC CONNECTION FUNCTIONS ============
async function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    try {
        peerConnection = new RTCPeerConnection(configuration);

        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
                console.log('✅ Added local track:', track.kind);
            });
        }

        peerConnection.ontrack = (event) => {
            console.log('📡 Received remote track:', event.track.kind);
            if (!remoteStream) {
                remoteStream = new MediaStream();
            }
            remoteStream.addTrack(event.track);
            
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.setAttribute('playsinline', '');
                console.log('🎥 Remote video stream set');

                remoteVideo.play().catch(error => {
                    console.warn('🚨 Remote video autoplay failed:', error);
                    setTimeout(() => remoteVideo.play(), 1000);
                });
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && currentRoom) {
                console.log('Sending ICE candidate:', event.candidate.type);
                socket.emit('candidate', event.candidate, currentRoom);
            }
        };

        return peerConnection;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        showMessage('Error creating connection', 'error');
        throw error;
    }
}

// ============ SOCKET COMMUNICATION FUNCTIONS ============
function initializeSocket() {
    try {
        socket = io(window.location.origin, {
            path: '/socket.io/',
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            const language = document.getElementById('language').value;
            const role = document.getElementById('role').value;
            socket.emit('join', { language, role });
        });

        setupSocketListeners();
    } catch (error) {
        console.error('Socket initialization error:', error);
        showMessage('Failed to connect to server', 'error');
    }
}

function setupSocketListeners() {
    socket.on('match', async ({ offer, room }) => {
        console.log(`🤝 Matched in room: ${room}, initiating offer: ${offer}`);
        currentRoom = room;
        await createPeerConnection();
        
        if (offer) {
            console.log('🎬 Creating offer...');
            const offerDescription = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offerDescription);
            socket.emit('offer', offerDescription, room);
            console.log('📤 Sent offer');
        } else {
            console.log('🛑 Waiting for offer...');
        }
    });

    socket.on('offer', async (offer) => {
        if (!peerConnection) {
            await createPeerConnection();
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('📩 Set remote offer description');

        while (iceCandidatesQueue.length > 0) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidatesQueue.shift()));
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer, currentRoom);
    });

    socket.on('candidate', async (candidate) => {
        if (peerConnection && peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            iceCandidatesQueue.push(candidate);
        }
    });
}

// ============ CALL MANAGEMENT FUNCTIONS ============
async function startCall() {
    try {
        if (!await checkMediaPermissions()) return;
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;
        localVideo.muted = true;
        await localVideo.play();

        await initializeSocket();
    } catch (error) {
        console.error('Error starting call:', error);
    }
}

function resetVideoCall() {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    if (socket) socket.disconnect();
}

function leaveCall() {
    resetVideoCall();
    showMessage('Call ended', 'info');
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('connect').addEventListener('click', startCall);
    document.getElementById('leave').addEventListener('click', leaveCall);
});
