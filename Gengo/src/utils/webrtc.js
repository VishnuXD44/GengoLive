// This file contains utility functions for managing WebRTC connections.

const configuration = {
    iceServers: [
        {
            urls: 'stun:stun.l.google.com:19302'
        }
    ]
};

let localStream;
let peerConnection;

export const startLocalStream = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        return localStream;
    } catch (error) {
        console.error('Error accessing media devices.', error);
    }
};

export const createPeerConnection = () => {
    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            // Send the candidate to the remote peer
            sendSignal('ice-candidate', event.candidate);
        }
    };

    peerConnection.ontrack = event => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = event.streams[0];
    };

    return peerConnection;
};

export const createOffer = async () => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    // Send the offer to the remote peer
    sendSignal('offer', offer);
};

export const handleOffer = async (offer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    // Send the answer back to the remote peer
    sendSignal('answer', answer);
};

export const handleAnswer = (answer) => {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
};

export const handleIceCandidate = (candidate) => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
};

const sendSignal = (type, data) => {
    // Implement signaling logic to send data to the remote peer
};