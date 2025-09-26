const { ipcRenderer } = require('electron');

class LocalShareRenderer {
    constructor() {
        this.devices = [];
        this.sources = [];
        this.selectedSource = null;
        this.isBroadcasting = false;
        this.currentConnection = null;
        this.peerConnection = null;
        this.broadcastPeerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        
    this.initializeElements();
    this.setupEventListeners();
    this.setupIPC();
    this.loadInitialData();
    this.updatePIN();
    }

    initializeElements() {
        // Buttons
        this.startBroadcastBtn = document.getElementById('startBroadcast');
        this.stopBroadcastBtn = document.getElementById('stopBroadcast');
        this.refreshDevicesBtn = document.getElementById('refreshDevices');
        this.disconnectViewerBtn = document.getElementById('disconnectViewer');
        
        // Status elements
        this.broadcastStatus = document.getElementById('broadcastStatus');
        this.deviceList = document.getElementById('deviceList');
        this.sourceList = document.getElementById('sourceList');
        this.viewerSection = document.getElementById('viewerSection');
        this.remoteScreen = document.getElementById('remoteScreen');
        this.qualitySelect = document.getElementById('qualitySelect');
    }

    setupEventListeners() {
        // Broadcast controls
        this.startBroadcastBtn.addEventListener('click', () => this.startBroadcasting());
        this.stopBroadcastBtn.addEventListener('click', () => this.stopBroadcasting());
        
        // Device discovery
        this.refreshDevicesBtn.addEventListener('click', () => this.refreshDevices());
        
        // Viewer controls
        this.disconnectViewerBtn.addEventListener('click', () => this.disconnectFromDevice());
        this.qualitySelect.addEventListener('change', (e) => this.changeQuality(e.target.value));
    }

    setupIPC() {
        // Listen for device discovery events
        ipcRenderer.on('device-discovered', (event, device) => {
            this.addDevice(device);
        });

        ipcRenderer.on('device-removed', (event, deviceName) => {
            this.removeDevice(deviceName);
        });

        ipcRenderer.on('broadcasting-started', (event, data) => {
            this.onBroadcastingStarted(data);
        });

        ipcRenderer.on('broadcasting-stopped', () => {
            this.onBroadcastingStopped();
        });

        ipcRenderer.on('stream-data', (event, data) => {
            console.log('Received stream data:', data);
            this.displayStreamData(data);
        });

        ipcRenderer.on('connection-error', (event, error) => {
            this.showConnectionError(error);
        });

        ipcRenderer.on('webrtc-setup', (event, data) => {
            this.handleWebRTCSetup(data);
        });

        ipcRenderer.on('webrtc-offer', (event, data) => {
            this.handleWebRTCOffer(data);
        });

        ipcRenderer.on('webrtc-answer', (event, data) => {
            this.handleWebRTCAnswer(data);
        });

        ipcRenderer.on('ice-candidate', (event, data) => {
            this.handleICECandidate(data);
        });

        ipcRenderer.on('start-screen-capture', (event, data) => {
            this.startScreenCaptureForBroadcasting(data.source);
        });

        // WebRTC handlers for broadcasting side
        ipcRenderer.on('webrtc-offer-broadcast', (event, data) => {
            this.handleWebRTCOfferForBroadcasting(data);
        });

        ipcRenderer.on('webrtc-answer-broadcast', (event, data) => {
            this.handleWebRTCAnswerForBroadcasting(data);
        });

        ipcRenderer.on('ice-candidate-broadcast', (event, data) => {
            this.handleICECandidateForBroadcasting(data);
        });

        // Handle test connection responses
        ipcRenderer.on('test-response', (event, data) => {
            console.log('🧪 Test response received:', data);
            this.displayStreamData('Test successful: ' + data.message);
        });

        // Handle auth required messages
        ipcRenderer.on('auth-required', (event, data) => {
            console.log('🔐 Authentication required');
            this.displayStreamData('Authentication required - please reconnect');
        });

        // Handle WebRTC messages from remote device
        ipcRenderer.on('webrtc-offer', (event, data) => {
            console.log('📡 Received WebRTC offer from remote device');
            this.handleWebRTCOffer(data);
        });

        ipcRenderer.on('webrtc-answer', (event, data) => {
            console.log('📡 Received WebRTC answer from remote device');
            this.handleWebRTCAnswer(data);
        });

        ipcRenderer.on('ice-candidate', (event, data) => {
            console.log('📡 Received ICE candidate from remote device');
            this.handleICECandidate(data);
        });

        // Handle stream status messages
        ipcRenderer.on('stream-ready', (event, data) => {
            console.log('📺 Stream ready from remote device:', data);
            this.displayStreamData('Stream ready: ' + data.message + ' (Tracks: ' + data.tracks + ')');
        });

        ipcRenderer.on('stream-error', (event, data) => {
            console.log('❌ Stream error from remote device:', data);
            this.displayStreamData('Stream error: ' + data.message);
        });
    }

    async loadInitialData() {
        await this.loadScreenSources();
        await this.refreshDevices();
    }

    async loadScreenSources() {
        try {
            this.sources = await ipcRenderer.invoke('get-screen-sources');
            this.renderScreenSources();
        } catch (error) {
            console.error('Failed to load screen sources:', error);
        }
    }

    renderScreenSources() {
        this.sourceList.innerHTML = '';
        
        if (this.sources.length === 0) {
            this.sourceList.innerHTML = '<p>No screen sources available</p>';
            return;
        }

        this.sources.forEach((source, index) => {
            const sourceElement = document.createElement('div');
            sourceElement.className = 'source-item';
            sourceElement.innerHTML = `
                <img src="${source.thumbnail.toDataURL()}" alt="${source.name}" class="source-thumbnail">
                <div class="source-name">${source.name}</div>
            `;
            
            sourceElement.addEventListener('click', () => {
                this.selectSource(source, sourceElement);
            });
            
            this.sourceList.appendChild(sourceElement);
        });
    }

    selectSource(source, element) {
        // Remove previous selection
        document.querySelectorAll('.source-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Select new source
        element.classList.add('selected');
        this.selectedSource = source;
    }

    async startBroadcasting() {
        if (!this.selectedSource) {
            alert('Please select a screen source first');
            return;
        }

        try {
            this.startBroadcastBtn.disabled = true;
            this.startBroadcastBtn.innerHTML = '<span class="loading"></span> Starting...';
            
            const result = await ipcRenderer.invoke('start-broadcasting');
            
            if (result.success) {
                this.isBroadcasting = true;
                this.updateBroadcastStatus(true);
                this.startBroadcastBtn.disabled = true;
                this.stopBroadcastBtn.disabled = false;
                this.startBroadcastBtn.innerHTML = 'Start Broadcasting';
            }
        } catch (error) {
            console.error('Failed to start broadcasting:', error);
            alert('Failed to start broadcasting: ' + error.message);
            this.startBroadcastBtn.disabled = false;
            this.startBroadcastBtn.innerHTML = 'Start Broadcasting';
        }
    }


    async stopBroadcasting() {
        try {
            // Stop local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            const result = await ipcRenderer.invoke('stop-broadcasting');
            
            if (result.success) {
                this.isBroadcasting = false;
                this.updateBroadcastStatus(false);
                this.startBroadcastBtn.disabled = false;
                this.stopBroadcastBtn.disabled = true;
            }
        } catch (error) {
            console.error('Failed to stop broadcasting:', error);
        }
    }

    updateBroadcastStatus(isBroadcasting) {
        const indicator = this.broadcastStatus.querySelector('.status-indicator');
        const text = this.broadcastStatus.querySelector('span:last-child');
        
        if (isBroadcasting) {
            indicator.className = 'status-indicator online';
            text.textContent = 'Broadcasting to network';
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = 'Not broadcasting';
        }
    }

    onBroadcastingStarted(data) {
        this.updateBroadcastStatus(true);
        console.log('Broadcasting started on port:', data.port);
    }

    onBroadcastingStopped() {
        this.updateBroadcastStatus(false);
        console.log('Broadcasting stopped');
    }

    async refreshDevices() {
        try {
            console.log('🔄 Refreshing device list...');
            // Trigger manual discovery
            await ipcRenderer.invoke('trigger-discovery');
            // Wait a moment for discovery to complete
            setTimeout(async () => {
                this.devices = await ipcRenderer.invoke('get-devices');
                console.log('📱 Found devices:', this.devices);
                this.renderDevices();
            }, 2000);
        } catch (error) {
            console.error('Failed to refresh devices:', error);
        }
    }

    addDevice(device) {
        // Check if device already exists
        const existingIndex = this.devices.findIndex(d => d.name === device.name);
        if (existingIndex >= 0) {
            this.devices[existingIndex] = device;
        } else {
            this.devices.push(device);
        }
        this.renderDevices();
    }

    removeDevice(deviceName) {
        this.devices = this.devices.filter(d => d.name !== deviceName);
        this.renderDevices();
    }

    renderDevices() {
        if (this.devices.length === 0) {
            this.deviceList.innerHTML = `
                <div class="no-devices">
                    <p>No devices found on the network</p>
                    <button id="refreshDevices" class="btn btn-outline">🔄 Refresh</button>
                </div>
            `;
            
            // Re-attach event listener
            document.getElementById('refreshDevices').addEventListener('click', () => this.refreshDevices());
            return;
        }

        this.deviceList.innerHTML = '';
        
        this.devices.forEach(device => {
            const deviceElement = document.createElement('div');
            deviceElement.className = 'device-item';
            deviceElement.innerHTML = `
                <div class="device-header">
                    <div class="device-name">🖥️ ${device.name}</div>
                </div>
                <div class="device-info">
                    <div>IP: ${device.ip}:${device.port}</div>
                    <div>Device: ${device.info?.device || 'Unknown'}</div>
                    <div>User: ${device.info?.user || 'Unknown'}</div>
                    <div>Quality: ${device.info?.quality || 'Unknown'}</div>
                </div>
                <div class="device-actions">
                    <button class="btn btn-primary" onclick="app.connectToDevice('${device.name}')">
                        Connect
                    </button>
                </div>
            `;
            
            this.deviceList.appendChild(deviceElement);
        });
    }

    async connectToDevice(deviceName) {
        const device = this.devices.find(d => d.name === deviceName);
        if (!device) {
            alert('Device not found');
            return;
        }

        // Check if device has PIN in info
        let devicePIN = device.info?.pin;
        if (!devicePIN) {
            // Prompt user for PIN
            devicePIN = prompt('Enter the PIN for ' + device.name + ':', '1234');
            if (!devicePIN) {
                console.log('User cancelled PIN entry');
                return;
            }
        }

        // Add PIN to device info for connection
        const deviceWithPIN = { ...device, info: { ...device.info, pin: devicePIN } };

        try {
            console.log('🔗 Attempting to connect to device:', deviceWithPIN);
            const result = await ipcRenderer.invoke('connect-to-device', deviceWithPIN);
            
            if (result.success) {
                this.showViewer();
                this.currentConnection = device;
                console.log('✅ Connected to device:', device.name);
                
                // Show connection status
                this.displayStreamData('Connected to ' + device.name);
                
                // Automatically request screen stream after connection
                setTimeout(() => {
                    this.requestScreenStream();
                }, 1000);
            } else {
                console.error('❌ Connection failed:', result.error);
                alert('Failed to connect: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('❌ Connection failed:', error);
            alert('Connection failed: ' + (error.message || error.toString()));
        }
    }

    showViewer() {
        this.viewerSection.style.display = 'block';
        this.viewerSection.scrollIntoView({ behavior: 'smooth' });
    }

    hideViewer() {
        this.viewerSection.style.display = 'none';
    }

    disconnectViewer() {
        this.hideViewer();
        this.currentConnection = null;
        console.log('Disconnected from viewer');
    }

    async disconnectFromDevice() {
        try {
            await ipcRenderer.invoke('disconnect-from-device');
            this.hideViewer();
            this.currentConnection = null;
            console.log('Disconnected from remote device');
        } catch (error) {
            console.error('Failed to disconnect:', error);
        }
    }

    displayStreamData(data) {
        console.log('📺 Displaying stream data:', data);
        console.log('🔍 Current remote stream:', this.remoteStream);
        console.log('🔍 Video tracks available:', this.remoteStream ? this.remoteStream.getVideoTracks().length : 0);
        
        const viewerContainer = document.querySelector('.viewer-container');
        if (!viewerContainer) return;
        
        // Check if we have a video stream
        if (this.remoteStream && this.remoteStream.getVideoTracks().length > 0) {
            console.log('✅ Displaying video stream');
            // Show the actual video stream
            viewerContainer.innerHTML = `
                <video id="remoteScreen" autoplay muted style="width:100%;height:auto;border-radius:8px;max-height:600px;"></video>
                <div class="stream-info" style="margin-top:10px;padding:10px;background:#f8f9fa;border-radius:6px;">
                    <p><strong>📺 Live Stream Active</strong></p>
                    <p>Receiving video from remote device</p>
                </div>
            `;
            
            // Assign the stream to the video element
            const videoElement = document.getElementById('remoteScreen');
            if (videoElement) {
                videoElement.srcObject = this.remoteStream;
                console.log('✅ Video stream assigned to video element');
            }
        } else {
            // Show connection status with more debugging info
            const streamStatus = this.remoteStream ? 
                `Remote stream exists but has ${this.remoteStream.getVideoTracks().length} video tracks` : 
                'No remote stream available';
                
            viewerContainer.innerHTML = `
                <div class="stream-placeholder">
                    <h3>🖥️ Screen Stream Connected</h3>
                    <div class="stream-info">
                        <p><strong>Status:</strong> ✅ Connected to remote device</p>
                        <p><strong>Stream Data:</strong> ${typeof data === 'string' ? data : JSON.stringify(data)}</p>
                        <p><strong>Stream Status:</strong> ${streamStatus}</p>
                        <p><strong>Note:</strong> WebRTC video streaming is being established...</p>
                    </div>
                    <div class="stream-controls">
                        <button onclick="app.testConnection()" class="btn btn-primary">Test Connection</button>
                        <button onclick="app.requestScreenStream()" class="btn btn-secondary">Request Screen Stream</button>
                        <button onclick="app.startWebRTCConnection()" class="btn btn-primary">Start WebRTC</button>
                        <button onclick="app.displayVideoStream()" class="btn btn-secondary">Display Video</button>
                        <button onclick="app.debugStreamStatus()" class="btn btn-outline">Debug Stream</button>
                        <button onclick="app.checkForRemoteStreams()" class="btn btn-outline">Check Streams</button>
                    </div>
                </div>
            `;
        }
    }

    async testConnection() {
        console.log('🧪 Testing connection...');
        try {
            // Send a test message to the remote device
            await ipcRenderer.invoke('send-webrtc-message', {
                type: 'test-connection',
                message: 'Hello from MacBook!'
            });
            console.log('✅ Test message sent');
        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    }

    async requestScreenStream() {
        console.log('📺 Requesting screen stream...');
        try {
            // Send a request for screen stream
            await ipcRenderer.invoke('send-webrtc-message', {
                type: 'request-stream'
            });
            console.log('✅ Screen stream requested');
        } catch (error) {
            console.error('❌ Request failed:', error);
        }
    }

    async startWebRTCConnection() {
        console.log('🔗 Starting WebRTC connection...');
        try {
            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // Handle incoming stream
            this.peerConnection.ontrack = (event) => {
                console.log('📺 Received remote stream event');
                console.log('📺 Event streams:', event.streams.length);
                console.log('📺 Event track:', event.track);
                
                if (event.streams && event.streams.length > 0) {
                    this.remoteStream = event.streams[0];
                    console.log('✅ Remote stream assigned:', this.remoteStream);
                    console.log('📊 Stream tracks:', this.remoteStream.getTracks().length);
                    console.log('📹 Video tracks:', this.remoteStream.getVideoTracks().length);
                    
                    // Display the video stream
                    this.displayStreamData('Video stream received');
                } else {
                    console.log('⚠️ No streams in track event');
                }
            };

            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                console.log('🔗 Connection state changed:', this.peerConnection.connectionState);
                if (this.peerConnection.connectionState === 'connected') {
                    console.log('✅ WebRTC connection established');
                } else if (this.peerConnection.connectionState === 'failed') {
                    console.log('❌ WebRTC connection failed');
                } else if (this.peerConnection.connectionState === 'disconnected') {
                    console.log('⚠️ WebRTC connection disconnected');
                }
            };

            // Handle ICE connection state changes
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('🧊 ICE connection state changed:', this.peerConnection.iceConnectionState);
                if (this.peerConnection.iceConnectionState === 'connected') {
                    console.log('✅ ICE connection established');
                } else if (this.peerConnection.iceConnectionState === 'failed') {
                    console.log('❌ ICE connection failed');
                } else if (this.peerConnection.iceConnectionState === 'disconnected') {
                    console.log('⚠️ ICE connection disconnected');
                }
            };

            // Handle ICE gathering state changes
            this.peerConnection.onicegatheringstatechange = () => {
                console.log('🧊 ICE gathering state changed:', this.peerConnection.iceGatheringState);
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('🧊 ICE candidate generated, sending to remote...');
                    this.sendWebSocketMessage({
                        type: 'ice-candidate',
                        candidate: event.candidate
                    });
                } else {
                    console.log('🧊 ICE candidate gathering complete');
                }
            };

            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Send offer
            this.sendWebSocketMessage({
                type: 'webrtc-offer',
                offer: offer
            });

            console.log('✅ WebRTC offer sent');
        } catch (error) {
            console.error('❌ WebRTC connection failed:', error);
        }
    }

    // Method to manually display video if stream is available
    displayVideoStream() {
        if (this.remoteStream && this.remoteStream.getVideoTracks().length > 0) {
            console.log('📺 Manually displaying video stream');
            this.displayStreamData('Video stream active');
        } else {
            console.log('⚠️ No video stream available to display');
        }
    }

    // Debug method to check stream status
    debugStreamStatus() {
        console.log('🔍 Debug Stream Status:');
        console.log('  - Remote stream exists:', !!this.remoteStream);
        console.log('  - Peer connection exists:', !!this.peerConnection);
        console.log('  - Peer connection state:', this.peerConnection ? this.peerConnection.connectionState : 'N/A');
        console.log('  - ICE connection state:', this.peerConnection ? this.peerConnection.iceConnectionState : 'N/A');
        console.log('  - ICE gathering state:', this.peerConnection ? this.peerConnection.iceGatheringState : 'N/A');
        console.log('  - Video tracks:', this.remoteStream ? this.remoteStream.getVideoTracks().length : 0);
        console.log('  - All tracks:', this.remoteStream ? this.remoteStream.getTracks().length : 0);
        
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach((track, index) => {
                console.log(`  - Track ${index}:`, track.kind, track.label, track.readyState);
            });
        }
        
        // Check if we have any remote streams in the peer connection
        if (this.peerConnection) {
            console.log('  - Remote streams in peer connection:', this.peerConnection.getRemoteStreams().length);
            this.peerConnection.getRemoteStreams().forEach((stream, index) => {
                console.log(`  - Remote stream ${index}:`, stream.getTracks().length, 'tracks');
            });
        }
        
        this.displayStreamData('Debug info logged to console');
    }

    // Method to manually check for remote streams in peer connection
    checkForRemoteStreams() {
        console.log('🔍 Checking for remote streams in peer connection...');
        if (this.peerConnection) {
            const remoteStreams = this.peerConnection.getRemoteStreams();
            console.log('📊 Remote streams found:', remoteStreams.length);
            
            if (remoteStreams.length > 0) {
                console.log('✅ Found remote streams! Assigning first one...');
                this.remoteStream = remoteStreams[0];
                console.log('📹 Video tracks in remote stream:', this.remoteStream.getVideoTracks().length);
                this.displayStreamData('Remote stream found and assigned');
            } else {
                console.log('⚠️ No remote streams found in peer connection');
            }
        } else {
            console.log('❌ No peer connection available');
        }
    }

    showConnectionError(error) {
        alert('Connection Error: ' + error);
        this.hideViewer();
        this.currentConnection = null;
    }

    async handleWebRTCSetup(data) {
        console.log('WebRTC setup received:', data);
        try {
            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // Handle incoming stream
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote stream');
                this.remoteStream = event.streams[0];
                this.displayRemoteStream(this.remoteStream);
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendWebSocketMessage({
                        type: 'ice-candidate',
                        candidate: event.candidate
                    });
                }
            };

            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Send offer
            this.sendWebSocketMessage({
                type: 'webrtc-offer',
                offer: offer
            });

            console.log('WebRTC offer sent');
        } catch (error) {
            console.error('WebRTC setup failed:', error);
        }
    }


    async handleWebRTCOffer(data) {
        console.log('WebRTC offer received:', data);
        try {
            if (!this.peerConnection) {
                // Create peer connection if it doesn't exist
                this.peerConnection = new RTCPeerConnection({
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                });

                // Handle ICE candidates
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        this.sendWebSocketMessage({
                            type: 'ice-candidate',
                            candidate: event.candidate
                        });
                    }
                };
            }

            // Set remote description
            await this.peerConnection.setRemoteDescription(data.offer);

            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // Send answer
            this.sendWebSocketMessage({
                type: 'webrtc-answer',
                answer: answer
            });

            console.log('WebRTC answer sent');
        } catch (error) {
            console.error('WebRTC offer handling failed:', error);
        }
    }

    async handleWebRTCAnswer(data) {
        console.log('📡 WebRTC answer received:', data);
        try {
            if (this.peerConnection) {
                console.log('✅ Setting remote description from answer...');
                await this.peerConnection.setRemoteDescription(data.answer);
                console.log('✅ Remote description set, connection should be establishing...');
                console.log('🔗 Current connection state:', this.peerConnection.connectionState);
                console.log('🧊 Current ICE state:', this.peerConnection.iceConnectionState);
            } else {
                console.error('❌ No peer connection available for answer');
            }
        } catch (error) {
            console.error('❌ WebRTC answer handling failed:', error);
        }
    }

    async handleICECandidate(data) {
        console.log('🧊 ICE candidate received:', data);
        try {
            if (this.peerConnection && data.candidate) {
                console.log('✅ Adding ICE candidate to peer connection...');
                await this.peerConnection.addIceCandidate(data.candidate);
                console.log('✅ ICE candidate added successfully');
                console.log('🔗 Current connection state:', this.peerConnection.connectionState);
                console.log('🧊 Current ICE state:', this.peerConnection.iceConnectionState);
            } else {
                console.log('⚠️ No peer connection or candidate available');
            }
        } catch (error) {
            console.error('❌ ICE candidate handling failed:', error);
        }
    }

    sendWebSocketMessage(message) {
        // This will be implemented to send messages via the main process
        console.log('Sending WebSocket message:', message);
        // For now, we'll use IPC to send the message
        ipcRenderer.invoke('send-webrtc-message', message);
    }

    displayRemoteStream(stream) {
        const remoteScreen = document.getElementById('remoteScreen');
        if (remoteScreen) {
            remoteScreen.srcObject = stream;
            remoteScreen.style.display = 'block';
            console.log('Remote stream displayed');
        }
    }

    async startScreenCaptureForBroadcasting(source) {
        try {
            console.log('🎥 Starting screen capture for broadcasting:', source.name);
            
            // Create a peer connection for broadcasting
            this.broadcastPeerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // Handle ICE candidates for broadcasting
            this.broadcastPeerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendWebSocketMessage({
                        type: 'ice-candidate',
                        candidate: event.candidate
                    });
                }
            };

            // Handle connection state changes
            this.broadcastPeerConnection.onconnectionstatechange = () => {
                console.log('🔗 Broadcast connection state:', this.broadcastPeerConnection.connectionState);
                if (this.broadcastPeerConnection.connectionState === 'connected') {
                    console.log('✅ Broadcast WebRTC connection established');
                }
            };

            // Try getDisplayMedia first (modern browsers)
            console.log('📺 Attempting screen capture using getDisplayMedia...');
            try {
                this.localStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: { ideal: 1920, max: 1920 },
                        height: { ideal: 1080, max: 1080 },
                        frameRate: { ideal: 30, max: 60 }
                    },
                    audio: false
                });
                console.log('✅ Screen capture stream obtained via getDisplayMedia');
            } catch (displayMediaError) {
                console.log('⚠️ getDisplayMedia failed, trying getUserMedia with desktop capture...');
                console.log('Error:', displayMediaError.message);
                
                // Fallback to getUserMedia with desktop capture (Electron-specific)
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id,
                            minWidth: 1280,
                            maxWidth: 1920,
                            minHeight: 720,
                            maxHeight: 1080,
                            maxFrameRate: 30
                        }
                    }
                });
                console.log('✅ Screen capture stream obtained via getUserMedia');
            }

            console.log('✅ Screen capture stream obtained:', this.localStream);
            console.log('📊 Stream tracks:', this.localStream.getTracks().length);
            console.log('📹 Video tracks:', this.localStream.getVideoTracks().length);

            // Add stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.broadcastPeerConnection.addTrack(track, this.localStream);
                console.log('📡 Added track to peer connection:', track.kind, track.label);
            });

            console.log('✅ Screen capture stream added to peer connection');
            
            // Send a test message to confirm stream is ready
            this.sendWebSocketMessage({
                type: 'stream-ready',
                message: 'Screen capture stream is ready and active',
                tracks: this.localStream.getTracks().length
            });
            
        } catch (error) {
            console.error('❌ Failed to start screen capture for broadcasting:', error);
            console.error('💡 Error details:', error.message);
            console.error('💡 This might be due to:');
            console.error('   1. User denied screen capture permission');
            console.error('   2. No screen available to capture');
            console.error('   3. Browser/Electron security restrictions');
            console.error('   4. Electron needs to be run with --enable-features=WebRTC');
            
            // Send error message
            this.sendWebSocketMessage({
                type: 'stream-error',
                message: 'Screen capture failed: ' + error.message
            });
        }
    }

    async handleWebRTCOfferForBroadcasting(data) {
        console.log('📡 WebRTC offer received for broadcasting:', data);
        try {
            if (this.broadcastPeerConnection) {
                console.log('✅ Setting remote description...');
                // Set remote description
                await this.broadcastPeerConnection.setRemoteDescription(data.offer);

                console.log('✅ Creating WebRTC answer...');
                // Create answer
                const answer = await this.broadcastPeerConnection.createAnswer();
                await this.broadcastPeerConnection.setLocalDescription(answer);

                console.log('📤 Sending WebRTC answer...');
                // Send answer
                this.sendWebSocketMessage({
                    type: 'webrtc-answer',
                    answer: answer
                });

                console.log('✅ WebRTC answer sent from broadcasting side');
            } else {
                console.error('❌ No broadcast peer connection available');
            }
        } catch (error) {
            console.error('❌ WebRTC offer handling failed for broadcasting:', error);
        }
    }

    async handleWebRTCAnswerForBroadcasting(data) {
        console.log('WebRTC answer received for broadcasting:', data);
        try {
            if (this.broadcastPeerConnection) {
                await this.broadcastPeerConnection.setRemoteDescription(data.answer);
                console.log('WebRTC connection established for broadcasting');
            }
        } catch (error) {
            console.error('WebRTC answer handling failed for broadcasting:', error);
        }
    }

    async handleICECandidateForBroadcasting(data) {
        console.log('ICE candidate received for broadcasting:', data);
        try {
            if (this.broadcastPeerConnection && data.candidate) {
                await this.broadcastPeerConnection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('ICE candidate handling failed for broadcasting:', error);
        }
    }

    changeQuality(quality) {
        console.log('Quality changed to:', quality);
        // Implement quality change logic here
    }

    async updatePIN() {
        try {
            const pin = await ipcRenderer.invoke('get-pin');
            this.displayPIN(pin);
        } catch (error) {
            console.error('Failed to get PIN:', error);
        }
    }

    displayPIN(pin) {
        // Create or update PIN display
        let pinDisplay = document.getElementById('pinDisplay');
        if (!pinDisplay) {
            pinDisplay = document.createElement('div');
            pinDisplay.id = 'pinDisplay';
            pinDisplay.className = 'pin-display';
            document.querySelector('.broadcast-section .card').appendChild(pinDisplay);
        }
        
        pinDisplay.innerHTML = `
            <div class="pin-info">
                <label>Connection PIN:</label>
                <span class="pin-value">${pin}</span>
                <button onclick="app.copyPIN()" class="btn btn-outline btn-small">Copy</button>
            </div>
        `;
    }

    copyPIN() {
        const pinValue = document.querySelector('.pin-value').textContent;
        navigator.clipboard.writeText(pinValue).then(() => {
            console.log('PIN copied to clipboard');
            // Show temporary feedback
            const button = document.querySelector('.pin-display button');
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LocalShareRenderer();
});
