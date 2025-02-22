// WebRTC configuration with STUN/TURN servers
export const configuration = {
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    sdpSemantics: 'unified-plan',
    iceTransportPolicy: 'all',
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ]
        }
    ]
};

// Connection monitoring configuration
const MONITORING_CONFIG = {
    qualityCheckInterval: 2000,    // Check quality every 2 seconds
    reconnectDelay: 2000,         // Wait 2 seconds before reconnecting
    maxReconnectAttempts: 3,      // Maximum number of reconnection attempts
    iceGatheringTimeout: 8000,    // ICE gathering timeout in milliseconds
    connectionTimeout: 30000      // Connection establishment timeout
};

// Connection state constants
const CONNECTION_STATES = {
    NEW: 'new',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed',
    CLOSED: 'closed'
};

// Debug logging helper
function logConnectionState(pc, prefix = '') {
    console.log(`${prefix} Connection States:`, {
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        connectionState: pc.connectionState
    });
}

// Default media constraints
const MEDIA_CONSTRAINTS = {
    video: {
        width: { min: 320, ideal: 640, max: 1280 },
        height: { min: 240, ideal: 480, max: 720 },
        frameRate: { min: 15, ideal: 24, max: 30 },
        aspectRatio: { ideal: 1.7777777778 },
        facingMode: 'user'
    },
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleSize: 16
    }
};

export async function startLocalStream(constraints = MEDIA_CONSTRAINTS) {
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
        console.log('\n=== Creating RTCPeerConnection ===');
        console.log('Configuration:', JSON.stringify(config, null, 2));

        // Initialize connection state tracking
        pc._iceCandidates = [];
        pc._connectionAttempts = 0;
        pc._maxAttempts = 3;
        pc._state = CONNECTION_STATES.NEW;
        pc._startTime = Date.now();
        pc._stats = {
            iceGatheringStart: null,
            iceGatheringEnd: null,
            firstIceCandidate: null,
            lastIceCandidate: null,
            connectionStart: null,
            connectionEstablished: null,
            restartAttempts: 0,
            totalCandidates: 0
        };

        // Set up ICE gathering timeout
        pc._gatheringTimeout = setTimeout(() => {
            if (pc.iceGatheringState !== 'complete') {
                console.warn('\n=== ICE Gathering Timeout ===');
                console.warn('ICE gathering incomplete after 8 seconds');
                console.warn('Current candidates:', pc._iceCandidates.length);
                logConnectionState(pc, 'Timeout:');
            }
        }, 8000);

        // Connection state monitoring
        pc.onconnectionstatechange = () => {
            const now = Date.now();
            console.log('\n=== Connection State Change ===');
            logConnectionState(pc);
            
            switch (pc.connectionState) {
                case 'connecting':
                    if (!pc._stats.connectionStart) {
                        pc._stats.connectionStart = now;
                    }
                    pc._state = CONNECTION_STATES.CONNECTING;
                    break;
                    
                case 'connected':
                    pc._state = CONNECTION_STATES.CONNECTED;
                    pc._stats.connectionEstablished = now;
                    console.log(`Connection established in ${(now - pc._startTime) / 1000}s`);
                    console.log('Connection statistics:', {
                        totalTime: `${(now - pc._startTime) / 1000}s`,
                        iceGatheringTime: pc._stats.iceGatheringEnd ?
                            `${(pc._stats.iceGatheringEnd - pc._stats.iceGatheringStart) / 1000}s` : 'incomplete',
                        candidates: pc._stats.totalCandidates,
                        attempts: pc._connectionAttempts + 1
                    });
                    break;
                    
                case 'failed':
                    if (pc._connectionAttempts < pc._maxAttempts) {
                        pc._connectionAttempts++;
                        pc._stats.restartAttempts++;
                        console.log(`\n=== Connection Failed - Attempt ${pc._connectionAttempts}/${pc._maxAttempts} ===`);
                        console.log('Connection statistics:', {
                            timeSinceStart: `${(now - pc._startTime) / 1000}s`,
                            candidates: pc._stats.totalCandidates,
                            lastCandidate: pc._stats.lastIceCandidate ?
                                `${(now - pc._stats.lastIceCandidate) / 1000}s ago` : 'none'
                        });
                        console.log('Initiating ICE restart...');
                        pc.restartIce();
                    } else {
                        pc._state = CONNECTION_STATES.FAILED;
                        console.error('\n=== Connection Failed - Max Attempts Reached ===');
                        logConnectionState(pc, 'Final state:');
                    }
                    break;
                    
                case 'disconnected':
                    console.log('\n=== Connection Disconnected ===');
                    pc._state = CONNECTION_STATES.DISCONNECTED;
                    break;
                    
                case 'closed':
                    pc._state = CONNECTION_STATES.CLOSED;
                    console.log('\n=== Connection Closed ===');
                    break;
            }
        };

        // ICE connection monitoring
        pc.oniceconnectionstatechange = () => {
            console.log('\n=== ICE Connection State Change ===');
            logConnectionState(pc);
            
            if (pc.iceConnectionState === 'failed') {
                console.log('ICE Connection failed - attempting restart');
                pc.restartIce();
            }
        };

        // Gathering state monitoring
        pc.onicegatheringstatechange = () => {
            const now = Date.now();
            console.log('\n=== ICE Gathering State Change ===');
            logConnectionState(pc);

            switch (pc.iceGatheringState) {
                case 'gathering':
                    pc._stats.iceGatheringStart = now;
                    break;
                case 'complete':
                    pc._stats.iceGatheringEnd = now;
                    clearTimeout(pc._gatheringTimeout);
                    console.log(`ICE gathering completed in ${(now - pc._stats.iceGatheringStart) / 1000}s`);
                    console.log(`Total candidates gathered: ${pc._stats.totalCandidates}`);
                    break;
            }
        };

        // ICE candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const now = Date.now();
                if (!pc._stats.firstIceCandidate) {
                    pc._stats.firstIceCandidate = now;
                }
                pc._stats.lastIceCandidate = now;
                pc._iceCandidates.push(event.candidate);
                pc._stats.totalCandidates++;
                
                console.log('\n=== New ICE Candidate ===');
                console.log('Candidate:', event.candidate.candidate);
                console.log(`Total candidates: ${pc._stats.totalCandidates}`);
            }
        };

        return pc;
    } catch (error) {
        console.error('Error creating peer connection:', error);
        throw error;
    }
}

export function monitorConnectionQuality(pc, onQualityChange) {
    if (!pc) {
        console.warn('Cannot monitor connection quality: no peer connection provided');
        return;
    }

    let lastStats = null;
    const statsHistory = [];
    const MAX_HISTORY = 30; // 1 minute of history at 2s intervals

    console.log('\n=== Starting Connection Quality Monitoring ===');
    logConnectionState(pc);

    const interval = setInterval(() => {
        // Only stop monitoring if connection is permanently closed
        if (!pc || pc.connectionState === 'closed') {
            console.log('\n=== Stopping Connection Quality Monitoring ===');
            console.log('Reason:', pc ? 'Connection closed' : 'No peer connection');
            clearInterval(interval);
            return;
        }

        // Log state changes but continue monitoring during temporary disconnections
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            console.log(`\n=== Connection State: ${pc.connectionState} - Continuing Monitoring ===`);
            logConnectionState(pc);
        }

        pc.getStats().then(stats => {
            const metrics = {
                timestamp: Date.now(),
                packetsLost: 0,
                packetsReceived: 0,
                bytesReceived: 0,
                bitrateKbps: 0,
                jitterMs: 0,
                roundTripTimeMs: 0,
                framesDropped: 0,
                framesReceived: 0,
                frameRate: 0,
                audioLevel: 0,
                connectionState: pc.connectionState,
                iceState: pc.iceConnectionState,
                signalingState: pc.signalingState,
                gatheringState: pc.iceGatheringState,
                totalCandidates: pc._stats?.totalCandidates || 0,
                connectionAttempts: pc._connectionAttempts || 0
            };

            stats.forEach(stat => {
                if (stat.type === 'inbound-rtp') {
                    metrics.packetsLost += stat.packetsLost || 0;
                    metrics.packetsReceived += stat.packetsReceived || 0;
                    metrics.bytesReceived += stat.bytesReceived || 0;
                    metrics.jitterMs += (stat.jitter || 0) * 1000;
                    
                    if (lastStats && lastStats[stat.id]) {
                        const timeDiff = (stat.timestamp - lastStats[stat.id].timestamp) / 1000;
                        const bytesDiff = stat.bytesReceived - lastStats[stat.id].bytesReceived;
                        metrics.bitrateKbps = (bytesDiff * 8) / timeDiff / 1000;
                    }
                } else if (stat.type === 'remote-candidate') {
                    metrics.roundTripTimeMs = stat.roundTripTime || 0;
                } else if (stat.type === 'track' && stat.kind === 'video') {
                    metrics.framesDropped = stat.framesDropped || 0;
                    metrics.framesReceived = stat.framesReceived || 0;
                    metrics.frameRate = stat.framesPerSecond || 0;
                } else if (stat.type === 'media-source' && stat.kind === 'audio') {
                    metrics.audioLevel = stat.audioLevel || 0;
                }
            });

            // Update stats history
            statsHistory.push(metrics);
            if (statsHistory.length > MAX_HISTORY) {
                statsHistory.shift();
            }

            // Calculate quality score
            const packetLossRate = metrics.packetsReceived ?
                (metrics.packetsLost / metrics.packetsReceived) * 100 : 0;
            
            let quality;
            const issues = [];

            // Check connection state first
            if (metrics.connectionState === 'failed') {
                quality = 'poor';
                issues.push('Connection failed');
            } else if (metrics.connectionState === 'disconnected') {
                quality = 'poor';
                issues.push('Connection disconnected');
            } else if (metrics.iceState === 'failed') {
                quality = 'poor';
                issues.push('ICE connection failed');
            } else if (packetLossRate > 5 || metrics.jitterMs > 100 || metrics.roundTripTimeMs > 300) {
                quality = 'poor';
                if (packetLossRate > 5) issues.push(`High packet loss: ${packetLossRate.toFixed(1)}%`);
                if (metrics.jitterMs > 100) issues.push(`High jitter: ${metrics.jitterMs.toFixed(1)}ms`);
                if (metrics.roundTripTimeMs > 300) issues.push(`High latency: ${metrics.roundTripTimeMs}ms`);
            } else if (metrics.connectionState === 'connecting' || metrics.iceState === 'checking') {
                quality = 'fair';
                issues.push('Connection in progress');
            } else if (packetLossRate > 2 || metrics.jitterMs > 50 || metrics.roundTripTimeMs > 200) {
                quality = 'fair';
                if (packetLossRate > 2) issues.push(`Moderate packet loss: ${packetLossRate.toFixed(1)}%`);
                if (metrics.jitterMs > 50) issues.push(`Moderate jitter: ${metrics.jitterMs.toFixed(1)}ms`);
                if (metrics.roundTripTimeMs > 200) issues.push(`Moderate latency: ${metrics.roundTripTimeMs}ms`);
            } else if (metrics.connectionState === 'connected' && metrics.iceState === 'connected') {
                quality = 'good';
            } else {
                quality = 'fair';
                issues.push(`Uncertain state: ${metrics.connectionState}/${metrics.iceState}`);
            }

            // Log detailed stats periodically
            if (statsHistory.length % 15 === 0) { // Every 30 seconds
                console.log('\n=== Connection Quality Report ===');
                console.log('Quality:', quality);
                console.log('Connection State:', metrics.connectionState);
                console.log('ICE State:', metrics.iceState);
                console.log('Signaling State:', metrics.signalingState);
                console.log('ICE Gathering State:', metrics.gatheringState);
                console.log('Connection Attempts:', metrics.connectionAttempts);
                console.log('Total ICE Candidates:', metrics.totalCandidates);

                if (issues.length > 0) {
                    console.log('Issues detected:', issues.join(', '));
                }

                console.log('Performance Metrics:', {
                    bitrate: `${metrics.bitrateKbps.toFixed(1)} Kbps`,
                    packetLoss: `${packetLossRate.toFixed(1)}%`,
                    jitter: `${metrics.jitterMs.toFixed(1)}ms`,
                    rtt: `${metrics.roundTripTimeMs}ms`,
                    frameRate: metrics.frameRate.toFixed(1),
                    framesDropped: metrics.framesDropped,
                    framesReceived: metrics.framesReceived,
                    audioLevel: metrics.audioLevel.toFixed(2)
                });

                // Log historical trends
                if (statsHistory.length > 1) {
                    const prevMetrics = statsHistory[statsHistory.length - 2];
                    console.log('Trends:', {
                        bitrateChange: `${((metrics.bitrateKbps - prevMetrics.bitrateKbps) / prevMetrics.bitrateKbps * 100).toFixed(1)}%`,
                        packetLossChange: `${(packetLossRate - (prevMetrics.packetsLost / prevMetrics.packetsReceived * 100)).toFixed(1)}%`,
                        jitterChange: `${(metrics.jitterMs - prevMetrics.jitterMs).toFixed(1)}ms`,
                        rttChange: `${(metrics.roundTripTimeMs - prevMetrics.roundTripTimeMs).toFixed(1)}ms`
                    });
                }

                logConnectionState(pc);
            }

            onQualityChange(quality);
            lastStats = stats;
        }).catch(error => {
            console.warn('\n=== Connection Quality Monitoring Error ===');
            console.warn('Error getting connection stats:', error);
            logConnectionState(pc);
        });
    }, 2000);

    // Return cleanup function
    return () => {
        console.log('\n=== Stopping Connection Quality Monitoring ===');
        clearInterval(interval);
    };
}