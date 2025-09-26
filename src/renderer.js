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
            this.devices = await ipcRenderer.invoke('get-devices');
            this.renderDevices();
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
            console.log('Attempting to connect to device:', deviceWithPIN);
            const result = await ipcRenderer.invoke('connect-to-device', deviceWithPIN);
            
            if (result.success) {
                this.showViewer();
                this.currentConnection = device;
                console.log('Connected to device:', device.name);
            } else {
                console.error('Connection failed:', result.error);
                alert('Failed to connect: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Connection failed:', error);
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
        const remoteScreen = document.getElementById('remoteScreen');
        const viewerContainer = remoteScreen?.parentElement;
        
        if (viewerContainer) {
            // Hide the video element and show stream info
            if (remoteScreen) {
                remoteScreen.style.display = 'none';
            }
            
            if (typeof data === 'object' && data.source) {
                // Display screen capture information
                viewerContainer.innerHTML = `
                    <div class="stream-placeholder">
                        <h3>🖥️ Screen Stream Active</h3>
                        <div class="stream-info">
                            <p><strong>Source:</strong> ${data.source}</p>
                            <p><strong>Status:</strong> ${data.message}</p>
                            <p><strong>Connection:</strong> ✅ Connected and receiving data</p>
                        </div>
                        <div class="stream-note">
                            <p><em>Note: This shows the connection is working. For actual video streaming, WebRTC implementation would be needed.</em></p>
                        </div>
                    </div>
                `;
            } else {
                // Display simple message
                viewerContainer.innerHTML = `
                    <div class="stream-placeholder">
                        <h3>🖥️ Screen Stream</h3>
                        <p>Receiving stream data: ${data}</p>
                        <p><strong>Status:</strong> ✅ Connected and receiving data</p>
                    </div>
                `;
            }
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
        console.log('WebRTC answer received:', data);
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(data.answer);
                console.log('WebRTC connection established');
            }
        } catch (error) {
            console.error('WebRTC answer handling failed:', error);
        }
    }

    async handleICECandidate(data) {
        console.log('ICE candidate received:', data);
        try {
            if (this.peerConnection && data.candidate) {
                await this.peerConnection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('ICE candidate handling failed:', error);
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
            console.log('Starting screen capture for broadcasting:', source.name);
            
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

            // Get screen capture stream
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id,
                        minWidth: 1280,
                        maxWidth: 1920,
                        minHeight: 720,
                        maxHeight: 1080
                    }
                }
            });

            // Add stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.broadcastPeerConnection.addTrack(track, this.localStream);
            });

            console.log('Screen capture stream added to peer connection');
        } catch (error) {
            console.error('Failed to start screen capture for broadcasting:', error);
        }
    }

    async handleWebRTCOfferForBroadcasting(data) {
        console.log('WebRTC offer received for broadcasting:', data);
        try {
            if (this.broadcastPeerConnection) {
                // Set remote description
                await this.broadcastPeerConnection.setRemoteDescription(data.offer);

                // Create answer
                const answer = await this.broadcastPeerConnection.createAnswer();
                await this.broadcastPeerConnection.setLocalDescription(answer);

                // Send answer
                this.sendWebSocketMessage({
                    type: 'webrtc-answer',
                    answer: answer
                });

                console.log('WebRTC answer sent from broadcasting side');
            }
        } catch (error) {
            console.error('WebRTC offer handling failed for broadcasting:', error);
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
