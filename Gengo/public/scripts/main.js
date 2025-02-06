// filepath: /c:/Users/vishn/Gengo/Gengo/public/scripts/main.js
const socket = io();

document.getElementById('connect').addEventListener('click', async () => {
    const language = document.getElementById('language').value;
    const role = document.getElementById('role').value;
    console.log(`Connecting with language: ${language}, role: ${role}`);
    socket.emit('join', { language, role });

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const peerConnection = new RTCPeerConnection();

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            console.log('Sending ICE candidate');
            socket.emit('candidate', event.candidate);
        }
    };

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    try {
        const stream = localVideo.srcObject;
        stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

        if (data.offer) {
            console.log('Creating answer');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer);
        } else {
            console.log('Creating offer');
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        }

        socket.on('answer', async (answer) => {
            console.log('Received answer');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on('candidate', async (candidate) => {
            console.log('Received ICE candidate');
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        });
    } catch (error) {
        console.error('Error during WebRTC connection setup.', error);
    }
});