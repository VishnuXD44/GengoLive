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
                handleDisconnection();
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
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject = null;
        }

        // Set up new stream
        remoteVideo.srcObject = stream;
        remoteVideo.setAttribute('playsinline', '');
        remoteVideo.setAttribute('autoplay', '');
        remoteVideo.muted = false;

        try {
            await remoteVideo.play();
            console.log('Remote video playback started successfully');
            showMessage('Connected to remote user', 'success');
        } catch (playError) {
            console.error('Error playing remote video:', playError);
            if (playError.name === 'NotAllowedError') {
                showMessage('Autoplay blocked. Click to play video.', 'warning');
                addPlayButton(remoteVideo);
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect');
    const disconnectButton = document.getElementById('disconnect');
    const languageSelect = document.getElementById('language');
    const roleSelect = document.getElementById('role');

    connectButton.addEventListener('click', async () => {
        try {
            const language = languageSelect.value;
            const role = roleSelect.value;

            if (!language || !role) {
                showMessage('Please select both language and role', 'warning');
                return;
            }

            connectButton.disabled = true;
            showMessage('Requesting media access...', 'info');

            localStream = await startLocalStream();
            
            socket.emit('join', { language, role });
            showMessage('Waiting for match...', 'info');
        } catch (error) {
            console.error('Error starting connection:', error);
            showMessage('Failed to access camera/microphone', 'error');
            connectButton.disabled = false;
        }
    });

    disconnectButton.addEventListener('click', () => {
        resetVideoCall();
        showMessage('Disconnected', 'info');
    });
});

// Initialize socket connection and set up listeners
const socket = io(window.location.origin, {
    path: '/socket.io/',
    transports: ['websocket']
});

setupSocketListeners();