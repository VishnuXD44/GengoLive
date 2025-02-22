import { configuration, startLocalStream, createPeerConnection, monitorConnectionQuality } from './webrtc.js';

// UI Elements
const connectButton = document.getElementById('connect');
const leaveButton = document.getElementById('leave');
const languageSelect = document.getElementById('language');
const roleSelect = document.getElementById('role');
const selectionContainer = document.getElementById('selection-container');
const videoContainer = document.querySelector('.video-container');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// State management
let socket = null;
let localStream = null;
let peerConnection = null;
let currentRoom = null;
let isInitiator = false;
let qualityMonitorCleanup = null;

// Initialize socket connection
function initializeSocket() {
    if (socket) {
        console.log('Cleaning up existing socket connection');
        socket.disconnect();
    }

    console.log('\n=== Initializing Socket Connection ===');
    socket = io();

    socket.on('connect', () => {
        console.log('Socket connected with ID:', socket.id);
        connectButton.disabled = false;
        updateUIState('ready');
    });

    socket.on('disconnect', () => {
        console.log('\n=== Socket Disconnected ===');
        handleDisconnect('Socket connection lost');
    });

    socket.on('error', (error) => {
        console.error('\n=== Socket Error ===');
        console.error('Error:', error);
        handleDisconnect(`Connection error: ${error.message}`);
    });

    socket.on('waiting', () => {
        console.log('\n=== Waiting for Match ===');
        updateUIState('waiting');
    });

    socket.on('match-found', async ({ room, role, peerRole }) => {
        try {
            console.log('\n=== Match Found ===');
            console.log('Room:', room);
            console.log('Your Role:', role);
            console.log('Peer Role:', peerRole);
            
            currentRoom = room;
            isInitiator = role === 'coach'; // Coach initiates the connection
            
            await setupConnection();
            
            if (isInitiator) {
                console.log('Initiating connection as coach...');
                await createAndSendOffer();
            } else {
                console.log('Waiting for offer from coach...');
            }
        } catch (error) {
            console.error('Error setting up connection:', error);
            handleDisconnect('Failed to setup connection');
        }
    });

    socket.on('offer', async ({ offer, room }) => {
        try {
            console.log('\n=== Received Offer ===');
            console.log('Room:', room);
            
            if (room !== currentRoom) {
                console.warn('Received offer for wrong room');
                return;
            }

            await handleOffer(offer);
        } catch (error) {
            console.error('Error handling offer:', error);
            handleDisconnect('Failed to process offer');
        }
    });

    socket.on('answer', async ({ answer, room }) => {
        try {
            console.log('\n=== Received Answer ===');
            console.log('Room:', room);
            
            if (room !== currentRoom || !peerConnection) {
                console.warn('Invalid answer state:', { currentRoom, hasPeerConnection: !!peerConnection });
                return;
            }

            await peerConnection.setRemoteDescription(answer);
            console.log('Successfully set remote description from answer');
        } catch (error) {
            console.error('Error handling answer:', error);
            handleDisconnect('Failed to process answer');
        }
    });

    socket.on('ice-candidate', async ({ candidate, room }) => {
        try {
            if (room !== currentRoom || !peerConnection) {
                console.warn('Invalid ICE candidate state');
                return;
            }

            await peerConnection.addIceCandidate(candidate);
            console.log('Successfully added ICE candidate');
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    });

    socket.on('user-disconnected', () => {
        console.log('\n=== Remote User Disconnected ===');
        handleDisconnect('Remote user disconnected');
    });

    socket.on('room-closed', ({ reason }) => {
        console.log('\n=== Room Closed ===');
        console.log('Reason:', reason);
        handleDisconnect(reason);
    });
}

// Setup WebRTC connection
async function setupConnection() {
    try {
        console.log('\n=== Setting Up Connection ===');
        
        if (!localStream) {
            console.log('Requesting local stream...');
            localStream = await startLocalStream();
        }

        if (peerConnection) {
            console.log('Cleaning up existing peer connection');
            cleanupPeerConnection();
        }

        peerConnection = await createPeerConnection();
        console.log('Peer connection created');

        // Add local stream
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
            console.log(`Added ${track.kind} track to peer connection`);
        });

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log(`Received remote ${event.track.kind} track`);
            if (remoteVideo.srcObject !== event.streams[0]) {
                console.log('Setting remote stream');
                remoteVideo.srcObject = event.streams[0];
                updateUIState('connected');
                
                // Start monitoring connection quality
                qualityMonitorCleanup = monitorConnectionQuality(peerConnection, (quality) => {
                    console.log(`Connection quality: ${quality}`);
                    // You could update UI here based on quality
                });
            }
        };

        // Handle ICE candidates
        let iceCandidatesQueue = [];
        let isRemoteDescriptionSet = false;

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('\n=== New Local ICE Candidate ===');
                console.log('Candidate type:', event.candidate.type);
                console.log('Protocol:', event.candidate.protocol);
                console.log('Address:', event.candidate.address);
                
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    room: currentRoom
                });
            } else {
                console.log('\n=== Local ICE Candidate Gathering Complete ===');
            }
        };

        // Handle ICE connection state changes
        peerConnection.oniceconnectionstatechange = () => {
            console.log('\n=== ICE Connection State Change ===');
            console.log('State:', peerConnection.iceConnectionState);
            
            switch (peerConnection.iceConnectionState) {
                case 'checking':
                    console.log('Checking ICE connection...');
                    break;
                case 'connected':
                    console.log('ICE connection established');
                    break;
                case 'disconnected':
                    console.warn('ICE connection disconnected - attempting recovery');
                    // Try to recover the connection
                    setTimeout(() => {
                        if (peerConnection.iceConnectionState === 'disconnected') {
                            peerConnection.restartIce();
                        }
                    }, 2000);
                    break;
                case 'failed':
                    console.error('ICE connection failed');
                    handleDisconnect('ICE connection failed');
                    break;
            }
        };

        // Handle ICE gathering state changes
        peerConnection.onicegatheringstatechange = () => {
            console.log('\n=== ICE Gathering State Change ===');
            console.log('State:', peerConnection.iceGatheringState);
            
            switch (peerConnection.iceGatheringState) {
                case 'gathering':
                    console.log('Started gathering ICE candidates');
                    break;
                case 'complete':
                    console.log('Finished gathering ICE candidates');
                    break;
            }
        };

        updateUIState('connecting');
    } catch (error) {
        console.error('Error in setupConnection:', error);
        handleDisconnect('Failed to setup connection');
        throw error;
    }
}

// Create and send offer
async function createAndSendOffer() {
    try {
        console.log('\n=== Creating Offer ===');
        
        // Create offer with specific constraints
        const offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            iceRestart: peerConnection._connectionAttempts > 0,
            voiceActivityDetection: true
        };
        
        const offer = await peerConnection.createOffer(offerOptions);
        
        // Modify SDP to improve connection reliability
        let sdp = offer.sdp;
        
        // Set bandwidth limits
        sdp = sdp.replace(/(m=video.*\r\n)/g, '$1b=AS:2000\r\n'); // 2 Mbps for video
        sdp = sdp.replace(/(m=audio.*\r\n)/g, '$1b=AS:64\r\n');   // 64 kbps for audio
        
        // Prioritize VP8 codec
        sdp = sdp.replace(/VP8/g, 'VP8/90000');
        
        // Enable NACK and PLI for better packet loss handling
        sdp = sdp.replace(/(a=rtcp-fb.*)/g, '$1\r\na=rtcp-fb:* nack\r\na=rtcp-fb:* nack pli');
        
        offer.sdp = sdp;
        
        console.log('Setting local description...');
        await peerConnection.setLocalDescription(offer);
        console.log('Local description set');

        // Wait briefly for initial candidates
        await new Promise(resolve => setTimeout(resolve, 1000));

        socket.emit('offer', {
            offer: offer,
            room: currentRoom
        });
        console.log('Offer sent');
        
        // Set a timeout for answer
        setTimeout(() => {
            if (peerConnection && peerConnection.signalingState === 'have-local-offer') {
                console.warn('\n=== No Answer Received - Retrying ===');
                createAndSendOffer();
            }
        }, 10000);
        
    } catch (error) {
        console.error('Error creating offer:', error);
        if (error.name === 'OperationError' && peerConnection._connectionAttempts < peerConnection._maxAttempts) {
            console.log('Retrying offer creation...');
            setTimeout(createAndSendOffer, 2000);
        } else {
            handleDisconnect('Failed to create offer: ' + error.message);
        }
    }
}

// Handle received offer
async function handleOffer(offer) {
    try {
        console.log('\n=== Processing Offer ===');
        
        // Validate the offer
        if (!offer.sdp) {
            throw new Error('Invalid offer: missing SDP');
        }

        // Modify received SDP if needed
        let sdp = offer.sdp;
        
        // Ensure bandwidth limits are set
        if (!sdp.includes('b=AS:')) {
            sdp = sdp.replace(/(m=video.*\r\n)/g, '$1b=AS:2000\r\n');
            sdp = sdp.replace(/(m=audio.*\r\n)/g, '$1b=AS:64\r\n');
        }
        
        offer.sdp = sdp;

        // Set remote description
        console.log('Setting remote description...');
        await peerConnection.setRemoteDescription(offer);
        console.log('Remote description set');

        // Create answer with specific constraints
        const answerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            voiceActivityDetection: true
        };

        console.log('Creating answer...');
        const answer = await peerConnection.createAnswer(answerOptions);
        
        // Modify answer SDP
        sdp = answer.sdp;
        sdp = sdp.replace(/(m=video.*\r\n)/g, '$1b=AS:2000\r\n');
        sdp = sdp.replace(/(m=audio.*\r\n)/g, '$1b=AS:64\r\n');
        answer.sdp = sdp;

        console.log('Setting local description...');
        await peerConnection.setLocalDescription(answer);
        console.log('Local description set');

        // Wait briefly for initial candidates
        await new Promise(resolve => setTimeout(resolve, 1000));

        socket.emit('answer', {
            answer: answer,
            room: currentRoom
        });
        console.log('Answer sent');
        
    } catch (error) {
        console.error('Error handling offer:', error);
        if (error.name === 'OperationError' && peerConnection._connectionAttempts < peerConnection._maxAttempts) {
            console.log('Retrying offer handling...');
            setTimeout(() => handleOffer(offer), 2000);
        } else {
            handleDisconnect('Failed to process offer: ' + error.message);
        }
    }
}

// Handle disconnection
function handleDisconnect(reason = 'Unknown reason') {
    console.log('\n=== Handling Disconnect ===');
    console.log('Reason:', reason);

    cleanupPeerConnection();
    currentRoom = null;
    isInitiator = false;
    updateUIState('disconnected');
}

// Cleanup peer connection
function cleanupPeerConnection() {
    if (qualityMonitorCleanup) {
        qualityMonitorCleanup();
        qualityMonitorCleanup = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
}

// Update UI state
function updateUIState(state) {
    console.log('\n=== Updating UI State ===');
    console.log('New state:', state);

    const videoControls = document.querySelector('.video-controls');

    switch (state) {
        case 'ready':
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

        case 'disconnected':
            connectButton.textContent = 'Connect';
            connectButton.disabled = false;
            selectionContainer.style.display = 'block';
            videoContainer.style.display = 'none';
            videoControls.style.display = 'none';
            break;
    }
}

// Event listeners
connectButton.addEventListener('click', () => {
    const language = languageSelect.value;
    const role = roleSelect.value;
    
    console.log('\n=== Initiating Connection ===');
    console.log('Language:', language);
    console.log('Role:', role);
    
    socket.emit('join', { language, role });
});

leaveButton.addEventListener('click', () => {
    console.log('\n=== User Initiated Disconnect ===');
    handleDisconnect('User left');
    socket.disconnect();
    initializeSocket();
});

// Initialize on page load
window.addEventListener('load', () => {
    console.log('\n=== Page Loaded ===');
    initializeSocket();
    updateUIState('ready');
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    console.log('\n=== Page Unloading ===');
    if (socket) {
        socket.disconnect();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    cleanupPeerConnection();
});