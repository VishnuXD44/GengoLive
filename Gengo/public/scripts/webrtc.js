export const configuration = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302'
            ]
        },
        {
            // Using Google's STUN servers as primary, and keeping openrelay as backup
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan'
};

export async function startLocalStream(constraints = {
    video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { max: 30 }
    },
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    }
}) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = stream;
            localVideo.muted = true;
        }
        return stream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        throw err;
    }
}