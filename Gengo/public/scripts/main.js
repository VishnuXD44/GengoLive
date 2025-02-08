import { startLocalStream, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate, initializeSocket } from '../utils/webrtc.js';

const socket = io('https://www.gengo.live');
initializeSocket(socket);

document.getElementById('connect').addEventListener('click', async () => {
    const language = document.getElementById('language').value;
    const role = document.getElementById('role').value;
    console.log(`Connecting with language: ${language}, role: ${role}`);
    socket.emit('join', { language, role });

    try {
        const stream = await startLocalStream();
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = stream;

        // Change the state of the page
        document.getElementById('selection-container').style.display = 'none';
        document.getElementById('video-container').style.display = 'block';
    } catch (error) {
        console.error('Error accessing media devices.', error);
    }
});

document.getElementById('leave').addEventListener('click', () => {
    // Change the state of the page
    document.getElementById('selection-container').style.display = 'block';
    document.getElementById('video-container').style.display = 'none';

    // Reload the page to reset the state
    window.location.href = 'main.html';
});

socket.on('match', async (data) => {
    console.log('Matched with another user');
    const peerConnection = createPeerConnection();

    if (data.offer) {
        console.log('Creating answer');
        await handleOffer(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer, data.room);
    } else {
        console.log('Creating offer');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer, data.room);
    }

    socket.on('answer', async (answer) => {
        console.log('Received answer');
        await handleAnswer(answer);
    });

    socket.on('candidate', async (candidate) => {
        console.log('Received ICE candidate');
        await handleIceCandidate(candidate);
    });
});