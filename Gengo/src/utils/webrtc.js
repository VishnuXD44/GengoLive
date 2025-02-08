const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

let localStream;
let remoteStream;
let peerConnection;

export async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
        return localStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        throw err;
    }
}

export async function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(configuration);

        // Add local stream
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Handle incoming stream
        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
            }
        };

        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        return offer;
    } catch (err) {
        console.error('Error creating peer connection:', err);
        throw err;
    }
}

export async function handleOffer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        return answer;
    } catch (err) {
        console.error('Error handling offer:', err);
        throw err;
    }
}

export function handleAnswer(answer) {
    return peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

export function handleIceCandidate(candidate) {
    return peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

export function cleanup() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
}
