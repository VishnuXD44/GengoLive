export const configuration = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ]
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 1
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
            // Clean up existing stream if any
            if (localVideo.srcObject) {
                localVideo.srcObject = null;
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Create a promise to handle the loadedmetadata event
            const metadataLoaded = new Promise((resolve, reject) => {
                localVideo.onloadedmetadata = () => resolve();
                localVideo.onerror = (e) => reject(e);
            });

            // Set up new stream
            localVideo.muted = true;
            localVideo.srcObject = stream;

            // Wait for metadata to load
            try {
                await metadataLoaded;
                console.log('Local video metadata loaded successfully');
                
                // Ensure video plays
                const playPromise = localVideo.play();
                if (playPromise !== undefined) {
                    await playPromise;
                    console.log('Local video playback started successfully');
                }
            } catch (error) {
                console.error('Error setting up local video:', error);
                // Continue even if local video fails - this is not critical
                // as long as the stream is available for the peer connection
            }
        }
        return stream;
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            throw new Error('Camera/microphone access denied. Please grant permission to use your media devices.');
        } else if (err.name === 'NotFoundError') {
            throw new Error('No camera/microphone found. Please ensure your devices are properly connected.');
        } else if (err.name === 'NotReadableError') {
            throw new Error('Could not access your media devices. Please ensure they are not being used by another application.');
        } else {
            console.error('Error accessing media devices:', err);
            throw new Error('Failed to access media devices. Please check your hardware and permissions.');
        }
    }
}   