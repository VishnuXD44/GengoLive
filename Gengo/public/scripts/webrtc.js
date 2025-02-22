// WebRTC configuration
const configuration = {
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

export async function createPeerConnection(config = configuration) {
    try {
        const pc = new RTCPeerConnection(config);
        
        // Initialize connection state tracking
        pc._iceCandidates = [];
        let connectionAttempts = 0;
        const MAX_ATTEMPTS = 3;

        // Set up ICE gathering timeout
        pc._gatheringTimeout = setTimeout(() => {
            if (pc.iceGatheringState !== 'complete') {
                console.warn('ICE gathering incomplete, continuing anyway');
            }
        }, 8000);

        // Connection state monitoring
        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState);
            if (pc.connectionState === 'failed' && connectionAttempts < MAX_ATTEMPTS) {
                connectionAttempts++;
                console.log(`Connection attempt ${connectionAttempts}/${MAX_ATTEMPTS}`);
                pc.restartIce();
            }
        };

        // ICE connection monitoring
        pc.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'failed') {
                pc.restartIce();
            }
        };

        // Gathering state monitoring
        pc.onicegatheringstatechange = () => {
            console.log('ICE Gathering State:', pc.iceGatheringState);
            if (pc.iceGatheringState === 'complete') {
                clearTimeout(pc._gatheringTimeout);
            }
        };

        return pc;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw error;
    }
}

export function monitorConnectionQuality(pc, onQualityChange) {
    let lastQuality = 'unknown';
    
    setInterval(() => {
        if (!pc || pc.connectionState !== 'connected') return;

        pc.getStats().then(stats => {
            let totalPacketsLost = 0;
            let totalPackets = 0;
            let avgJitter = 0;
            let jitterCount = 0;

            stats.forEach(stat => {
                if (stat.type === 'inbound-rtp') {
                    totalPacketsLost += stat.packetsLost || 0;
                    totalPackets += stat.packetsReceived || 0;
                    if (stat.jitter) {
                        avgJitter += stat.jitter;
                        jitterCount++;
                    }
                }
            });

            const packetLossRate = totalPackets ? (totalPacketsLost / totalPackets) * 100 : 0;
            const avgJitterMs = jitterCount ? (avgJitter / jitterCount) * 1000 : 0;

            let quality;
            if (packetLossRate > 5 || avgJitterMs > 100) {
                quality = 'poor';
            } else if (packetLossRate > 2 || avgJitterMs > 50) {
                quality = 'fair';
            } else {
                quality = 'good';
            }

            if (quality !== lastQuality) {
                lastQuality = quality;
                onQualityChange(quality);
            }
        });
    }, 2000);
}