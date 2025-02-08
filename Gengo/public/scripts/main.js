import { startLocalStream, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate } from '../utils/webrtc.js';

let socket;
let currentRoom;

// Initialize Socket.IO connection
function initializeSocket() {
    socket = io('https://www.gengo.live', {
        withCredentials: true,
        transports: ['websocket']
    });

    socket.on('match', ({ offer, room }) => {
        console.log('Matched with a peer');
        currentRoom = room;
        if (offer) {
            createPeerConnection()
                .then(offerDescription => {
                    socket.emit('offer', offerDescription, room);
                })
                .catch(err => console.error('Error creating offer:', err));
        }
    });

    socket.on('offer', (offer) => {
        console.log('Received offer');
        createPeerConnection()
            .then(() => handleOffer(offer))
            .then(answer => {
                socket.emit('answer', answer, currentRoom);
            })
            .catch(err => console.error('Error handling offer:', err));
    });

    socket.on('answer', (answer) => {
        console.log('Received answer');
        handleAnswer(answer)
            .catch(err => console.error('Error handling answer:', err));
    });

    socket.on('candidate', (candidate) => {
        console.log('Received ICE candidate');
        handleIceCandidate(candidate)
            .catch(err => console.error('Error handling ICE candidate:', err));
    });

    return socket;
}

// Connect button click handler
document.getElementById('connect')?.addEventListener('click', () => {
    const language = document.getElementById('language').value;
    const role = document.getElementById('role').value;

    startLocalStream()
        .then(() => {
            socket = initializeSocket();
            socket.emit('join', { language, role });
            document.getElementById('selection-container').style.display = 'none';
            document.getElementById('video-container').style.display = 'block';
        })
        .catch(err => console.error('Error starting local stream:', err));
});

// Leave button click handler
document.getElementById('leave')?.addEventListener('click', () => {
    if (socket) {
        socket.disconnect();
    }
    document.getElementById('video-container').style.display = 'none';
    document.getElementById('selection-container').style.display = 'block';
});
