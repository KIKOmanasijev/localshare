const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
const mdns = require('multicast-dns')();
const WebSocket = require('ws');
const express = require('express');

class LocalShareApp {
  constructor() {
    this.mainWindow = null;
    this.isStreaming = false;
    this.devices = new Map();
    this.browser = null;
    this.wss = null;
    this.httpServer = null;
    this.port = 8080;
    this.wsPort = null;
    this.pin = this.generatePIN();
    this.connectedClients = new Set();
    this.remoteConnection = null;
    this.peerConnections = new Map();
    this.localStream = null;
    this.selectedSource = null;
  }

  generatePIN() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  getNetworkIP() {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          // Prefer 192.168.x.x, 10.x.x.x, or 172.16-31.x.x ranges
          if (iface.address.startsWith('192.168.') || 
              iface.address.startsWith('10.') || 
              iface.address.startsWith('172.')) {
            console.log('Found network IP:', iface.address, 'on interface:', interfaceName);
            return iface.address;
          }
        }
      }
    }
    
    // Fallback to any non-internal IPv4 address
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log('Using fallback network IP:', iface.address, 'on interface:', interfaceName);
          return iface.address;
        }
      }
    }
    
    console.log('No network IP found, using localhost');
    return '127.0.0.1';
  }

  isLocalNetwork(ip) {
    // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.x.x)
    if (ip.startsWith('::ffff:')) {
      const ipv4 = ip.substring(7); // Remove '::ffff:' prefix
      return this.isLocalNetwork(ipv4);
    }
    
    // Check if IP is in local network ranges
    const localRanges = [
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./
    ];
    return localRanges.some(range => range.test(ip));
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
        // Enable screen capture APIs
        webSecurity: false,
        allowRunningInsecureContent: true,
        experimentalFeatures: true
      },
      icon: path.join(__dirname, 'assets/icon.png'),
      title: 'LocalShare - Screen Sharing'
    });

    this.mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  startDiscovery() {
    try {
      console.log('🔍 Starting device discovery...');
      
      // Listen for mDNS queries
      mdns.on('query', (query) => {
        console.log('📡 mDNS query received:', JSON.stringify(query, null, 2));
        // Respond to queries for our service
        if (query.questions.some(q => q.name === 'localshare._tcp.local')) {
          console.log('✅ Received query for localshare service');
        }
      });

      // Listen for responses
      mdns.on('response', (response) => {
        console.log('📨 mDNS response received:', JSON.stringify(response, null, 2));
        
        response.answers.forEach(answer => {
          if (answer.type === 'PTR' && answer.name === 'localshare._tcp.local') {
            console.log('Found PTR record:', answer);
            
            // Look for IP address in both answers and additionals
            let ip = 'unknown';
            let port = 8080;
            let info = {};
            
            // Check answers for A record
            const aRecord = response.answers.find(a => a.type === 'A');
            if (aRecord && aRecord.data) {
              ip = aRecord.data;
              console.log('Found A record in answers:', ip);
            }
            
            // Check additionals for A record
            const additionalARecord = response.additionals.find(a => a.type === 'A');
            if (additionalARecord && additionalARecord.data) {
              ip = additionalARecord.data;
              console.log('Found A record in additionals:', ip);
            }
            
            // If still no IP, try to get it from the response source
            if (ip === 'unknown' && response.src) {
              ip = response.src;
              console.log('Using response source IP:', ip);
            }
            
            // Check for SRV record for port
            const srvRecord = response.answers.find(a => a.type === 'SRV') || 
                             response.additionals.find(a => a.type === 'SRV');
            if (srvRecord && srvRecord.data) {
              port = srvRecord.data.port || 8080;
            }
            
            // Check for TXT record for additional info
            const txtRecord = response.answers.find(a => a.type === 'TXT') || 
                             response.additionals.find(a => a.type === 'TXT');
            if (txtRecord && txtRecord.data) {
              console.log('TXT record data:', txtRecord.data, 'type:', typeof txtRecord.data);
              if (Array.isArray(txtRecord.data)) {
                txtRecord.data.forEach(item => {
                  try {
                    // Handle different data types
                    let itemStr = item;
                    if (Buffer.isBuffer(item)) {
                      itemStr = item.toString();
                    } else if (typeof item !== 'string') {
                      itemStr = String(item);
                    }
                    
                    if (typeof itemStr === 'string' && itemStr.includes('=')) {
                      const [key, value] = itemStr.split('=');
                      if (key && value) {
                        info[key] = value;
                      }
                    }
                  } catch (parseError) {
                    console.log('Could not parse TXT item:', item, parseError);
                  }
                });
              }
            }
            
            const deviceInfo = {
              name: answer.data,
              ip: ip,
              port: port,
              info: info,
              lastSeen: Date.now()
            };
            
            this.devices.set(deviceInfo.name, deviceInfo);
            console.log('Device discovered:', deviceInfo);
            
            // Notify renderer process
            if (this.mainWindow) {
              this.mainWindow.webContents.send('device-discovered', deviceInfo);
            }
          }
        });
      });

      // Query for services
      console.log('🔍 Querying for localshare services...');
      mdns.query('localshare._tcp.local', 'PTR');
      
      // Also query for any _tcp services to see what's available
      console.log('🔍 Querying for all _tcp services...');
      mdns.query('_tcp.local', 'PTR');
      
      console.log('✅ Device discovery started');
      
      // Set up periodic discovery refresh
      this.discoveryInterval = setInterval(() => {
        console.log('🔄 Periodic discovery refresh...');
        mdns.query('localshare._tcp.local', 'PTR');
      }, 10000); // Query every 10 seconds
      
    } catch (error) {
      console.error('Failed to start discovery:', error);
    }
  }

  startMDNSAdvertisement() {
    try {
      const hostname = require('os').hostname();
      const serviceName = `${hostname}._localshare._tcp.local`;
      const networkIP = this.getNetworkIP();
      
      console.log('📢 Starting mDNS advertisement...');
      console.log('🖥️ Hostname:', hostname);
      console.log('🏷️ Service name:', serviceName);
      console.log('🌐 Network IP:', networkIP);
      console.log('🔌 HTTP Port:', this.port);
      console.log('🔌 WebSocket Port:', this.wsPort);
      
      // Use WebSocket port for the service advertisement
      const servicePort = this.wsPort || this.port;
      
      // Advertise our service
      const records = [{
        name: 'localshare._tcp.local',
        type: 'PTR',
        data: serviceName
      }, {
        name: serviceName,
        type: 'SRV',
        data: {
          port: servicePort,
          target: hostname + '.local'
        }
      }, {
        name: serviceName,
        type: 'TXT',
        data: [
          `device=${require('os').type()}`,
          `user=${require('os').userInfo().username}`,
          'quality=1080p',
          `wsport=${this.wsPort}`,
          `httpport=${this.port}`,
          `pin=${this.pin}`
        ]
      }];
      
      // Add A record with the actual network IP
      if (networkIP && networkIP !== '127.0.0.1') {
        records.push({
          name: hostname + '.local',
          type: 'A',
          data: networkIP
        });
        console.log('Added A record with network IP:', networkIP);
      }
      
      console.log('📋 Advertising records:', JSON.stringify(records, null, 2));
      mdns.respond(records);
      
      console.log('✅ mDNS advertisement started');
    } catch (error) {
      console.error('Failed to start mDNS advertisement:', error);
    }
  }

  async startBroadcasting() {
    try {
      console.log('🚀 Starting broadcasting process...');
      
      // Start HTTP server for discovery first
      const expressApp = express();
      expressApp.use(express.json());
      
      expressApp.get('/discover', (req, res) => {
        res.json({
          name: require('os').hostname(),
          type: 'localshare',
          port: this.port,
          status: this.isStreaming ? 'streaming' : 'idle'
        });
      });

      this.httpServer = expressApp.listen(0, () => {
        this.port = this.httpServer.address().port;
        console.log(`✅ HTTP server started on port ${this.port}`);
      });

      // Start WebSocket server for streaming
      this.wss = new WebSocket.Server({ port: 0 });
      this.wss.on('listening', () => {
        this.wsPort = this.wss.address().port;
        console.log(`✅ WebSocket server started on port ${this.wsPort}`);
        
        // Start mDNS advertisement after both servers are ready
        this.startMDNSAdvertisement();
      });
      
      this.wss.on('connection', (ws, req) => {
        const clientIP = req.socket.remoteAddress;
        
        // Security check - only allow local network connections
        if (!this.isLocalNetwork(clientIP)) {
          console.log('Rejected connection from non-local IP:', clientIP);
          ws.close(1008, 'Local network only');
          return;
        }
        
        console.log('Client connected from:', clientIP);
        this.connectedClients.add(ws);
        
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message);
            this.handleWebSocketMessage(ws, data);
          } catch (error) {
            console.error('Invalid WebSocket message:', error);
          }
        });
        
        ws.on('close', () => {
          console.log('Client disconnected');
          this.connectedClients.delete(ws);
        });
        
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.connectedClients.delete(ws);
        });
      });

      // Try to start screen capture, but don't fail if it doesn't work
      try {
        await this.startScreenCapture();
        console.log('✅ Screen capture started successfully');
      } catch (screenCaptureError) {
        console.log('⚠️ Screen capture failed, but broadcasting will continue:', screenCaptureError.message);
        console.log('💡 The device will be discoverable, but screen sharing may not work until permissions are fixed');
      }

      this.isStreaming = true;
      console.log('✅ Broadcasting started successfully');
      
      if (this.mainWindow) {
        this.mainWindow.webContents.send('broadcasting-started', { port: this.port });
      }
    } catch (error) {
      console.error('❌ Failed to start broadcasting:', error);
    }
  }

  async startScreenCapture() {
    try {
      console.log('🎥 Starting screen capture process...');
      
      // Get screen sources
      const sources = await this.getScreenSources();
      if (sources.length === 0) {
        const errorMsg = 'No screen sources available. Please check screen recording permissions.';
        console.error('❌', errorMsg);
        throw new Error(errorMsg);
      }

      // Use the first available screen source
      this.selectedSource = sources[0];
      console.log('✅ Screen capture source selected:', this.selectedSource.name);
      
      // Start screen capture using Electron's native capabilities
      await this.startNativeScreenCapture();
      
      console.log('✅ Screen capture process started successfully');
    } catch (error) {
      console.error('❌ Failed to start screen capture:', error);
      console.error('💡 Troubleshooting tips:');
      console.error('   1. Check Windows Privacy & Security → Screen recording');
      console.error('   2. Run LocalShare as administrator');
      console.error('   3. Check Windows Security settings');
      console.error('   4. Ensure no other apps are blocking screen capture');
      throw error;
    }
  }

  async startNativeScreenCapture() {
    try {
      console.log('📺 Starting native screen capture...');
      
      // Create a hidden window for screen capture
      const captureWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false
        }
      });

      // Load a simple HTML page for screen capture
      captureWindow.loadURL(`data:text/html,
        <html>
          <body>
            <video id="screenVideo" autoplay muted style="width:100%;height:100%;"></video>
            <script>
              const video = document.getElementById('screenVideo');
              
              async function startCapture() {
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                      mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: '${this.selectedSource.id}',
                        minWidth: 1280,
                        maxWidth: 1920,
                        minHeight: 720,
                        maxHeight: 1080
                      }
                    }
                  });
                  
                  video.srcObject = stream;
                  console.log('Screen capture started successfully');
                } catch (error) {
                  console.error('Screen capture failed:', error);
                }
              }
              
              startCapture();
            </script>
          </body>
        </html>
      `);

      this.captureWindow = captureWindow;
      console.log('✅ Native screen capture window created');
      
    } catch (error) {
      console.error('❌ Failed to start native screen capture:', error);
      throw error;
    }
  }

  stopBroadcasting() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    if (this.captureWindow) {
      this.captureWindow.close();
      this.captureWindow = null;
    }
    this.isStreaming = false;
    console.log('Broadcasting stopped');
    
    if (this.mainWindow) {
      this.mainWindow.webContents.send('broadcasting-stopped');
    }
  }

  async getScreenSources() {
    try {
      console.log('Requesting screen sources...');
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 240 }
      });
      console.log(`Found ${sources.length} screen sources`);
      sources.forEach((source, index) => {
        console.log(`  ${index + 1}. ${source.name} (${source.id})`);
      });
      
      if (sources.length === 0) {
        console.error('❌ No screen sources available!');
        console.error('This usually means:');
        console.error('1. Screen recording permissions are not granted');
        console.error('2. No screens/windows are available to capture');
        console.error('3. Windows security settings are blocking access');
      }
      
      return sources;
    } catch (error) {
      console.error('Failed to get screen sources:', error);
      console.error('This usually means screen recording permissions are not granted');
      console.error('Error details:', error.message);
      return [];
    }
  }

  handleWebSocketMessage(ws, data) {
    switch (data.type) {
      case 'authenticate':
        // Handle PIN authentication
        if (data.pin === this.pin) {
          ws.authenticated = true;
          ws.send(JSON.stringify({ type: 'auth-success' }));
          console.log('Client authenticated successfully');
        } else {
          ws.send(JSON.stringify({ type: 'auth-failed' }));
          console.log('Authentication failed for client');
        }
        break;
      case 'offer':
        // Handle WebRTC offer
        if (ws.authenticated) {
          console.log('Received WebRTC offer');
        }
        break;
      case 'answer':
        // Handle WebRTC answer
        if (ws.authenticated) {
          console.log('Received WebRTC answer');
        }
        break;
      case 'ice-candidate':
        // Handle ICE candidate
        if (ws.authenticated) {
          console.log('Received ICE candidate');
        }
        break;
      case 'request-stream':
        // Handle stream request
        if (ws.authenticated) {
          console.log('Stream requested');
          this.sendStreamData(ws);
        }
        break;
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  }

  async sendStreamData(ws) {
    try {
      // Get screen sources
      const sources = await this.getScreenSources();
      if (sources.length === 0) {
        ws.send(JSON.stringify({
          type: 'stream-data',
          data: 'No screen sources available'
        }));
        return;
      }

      // Use the selected source or first available
      const source = this.selectedSource || sources[0];
      console.log('Capturing screen from:', source.name);

      // Start WebRTC peer connection
      await this.startWebRTCConnection(ws, source);
    } catch (error) {
      console.error('Failed to capture screen:', error);
      ws.send(JSON.stringify({
        type: 'stream-data',
        data: 'Screen capture failed: ' + error.message
      }));
    }
  }

  async startWebRTCConnection(ws, source) {
    try {
      // Create a unique connection ID
      const connectionId = Date.now().toString();
      
      // Store the WebSocket connection
      this.peerConnections.set(connectionId, ws);
      
      // Send WebRTC setup message to renderer
      if (this.mainWindow) {
        this.mainWindow.webContents.send('webrtc-setup', {
          connectionId: connectionId,
          source: source.name,
          sourceId: source.id
        });
      }
      
      console.log('WebRTC connection setup initiated for:', source.name);
    } catch (error) {
      console.error('Failed to start WebRTC connection:', error);
    }
  }

  handleWebRTCSetup(data) {
    // Forward WebRTC setup to renderer
    if (this.mainWindow) {
      this.mainWindow.webContents.send('webrtc-setup', data);
    }
  }

  handleWebRTCOffer(data, ws) {
    // Forward WebRTC offer to renderer (broadcasting side)
    if (this.mainWindow) {
      this.mainWindow.webContents.send('webrtc-offer-broadcast', data);
    }
  }

  handleWebRTCAnswer(data, ws) {
    // Forward WebRTC answer to renderer (broadcasting side)
    if (this.mainWindow) {
      this.mainWindow.webContents.send('webrtc-answer-broadcast', data);
    }
  }

  handleICECandidate(data, ws) {
    // Forward ICE candidate to renderer (broadcasting side)
    if (this.mainWindow) {
      this.mainWindow.webContents.send('ice-candidate-broadcast', data);
    }
  }

  handleRemoteMessage(data) {
    switch (data.type) {
      case 'auth-success':
        console.log('Authentication successful with remote device');
        // Request screen stream
        this.remoteConnection.send(JSON.stringify({
          type: 'request-stream'
        }));
        break;
      case 'auth-failed':
        console.log('Authentication failed with remote device');
        if (this.mainWindow) {
          this.mainWindow.webContents.send('connection-error', 'Authentication failed');
        }
        break;
      case 'stream-data':
        console.log('Received stream data from remote device');
        // Forward stream data to renderer
        if (this.mainWindow) {
          this.mainWindow.webContents.send('stream-data', data.data);
        }
        break;
      case 'webrtc-offer':
        console.log('Received WebRTC offer from remote device');
        this.handleWebRTCOffer(data, ws);
        break;
      case 'webrtc-answer':
        console.log('Received WebRTC answer from remote device');
        this.handleWebRTCAnswer(data, ws);
        break;
      case 'ice-candidate':
        console.log('Received ICE candidate from remote device');
        this.handleICECandidate(data, ws);
        break;
      case 'webrtc-setup':
        console.log('Received WebRTC setup from remote device');
        this.handleWebRTCSetup(data);
        break;
      default:
        console.log('Unknown message type from remote device:', data.type);
    }
  }

  setupIPC() {
    ipcMain.handle('get-screen-sources', async () => {
      return await this.getScreenSources();
    });

    ipcMain.handle('start-broadcasting', () => {
      this.startBroadcasting();
      return { success: true };
    });

    ipcMain.handle('stop-broadcasting', () => {
      this.stopBroadcasting();
      return { success: true };
    });

    ipcMain.handle('get-devices', () => {
      return Array.from(this.devices.values());
    });

    ipcMain.handle('trigger-discovery', () => {
      console.log('🔍 Manual discovery triggered');
      mdns.query('localshare._tcp.local', 'PTR');
      mdns.query('_tcp.local', 'PTR');
      return { success: true };
    });

    ipcMain.handle('connect-to-device', async (event, deviceInfo) => {
      try {
        console.log('Connecting to device:', deviceInfo);
        
        // Get PIN from device info or prompt user
        let remotePIN = deviceInfo.info?.pin;
        if (!remotePIN) {
          // If no PIN in device info, we'll use a default for now
          // In a real implementation, this would prompt the user
          remotePIN = '1234';
          console.log('No PIN found in device info, using default PIN');
        }
        
        // If IP is unknown, try to resolve it from the device name
        let targetIP = deviceInfo.ip;
        
        // Filter out invalid IPs (IPv6, etc.) but allow localhost for testing
        if (targetIP === 'unknown' || !targetIP || targetIP === '::1' || targetIP.includes(':')) {
          console.log('IP is invalid or unknown, trying to resolve device name:', deviceInfo.name);
          // Try to resolve the device name to IP
          try {
            const { lookup } = require('dns').promises;
            const result = await lookup(deviceInfo.name.replace('._localshare._tcp.local', ''), { family: 4 }); // Force IPv4
            targetIP = result.address;
            console.log('Resolved IP:', targetIP);
          } catch (resolveError) {
            console.error('Failed to resolve device name:', resolveError);
            
            // Try to get local network IP as fallback
            try {
              const os = require('os');
              const networkInterfaces = os.networkInterfaces();
              for (const interfaceName in networkInterfaces) {
                const interfaces = networkInterfaces[interfaceName];
                for (const iface of interfaces) {
                  if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168.')) {
                    targetIP = iface.address;
                    console.log('Using local network IP as fallback:', targetIP);
                    break;
                  }
                }
                if (targetIP !== 'unknown') break;
              }
            } catch (networkError) {
              console.error('Failed to get local network IP:', networkError);
            }
            
            if (targetIP === 'unknown') {
              return { success: false, error: 'Could not resolve device IP address' };
            }
          }
        }
        
        // Final validation of IP address
        if (!targetIP || targetIP === 'unknown' || targetIP === '::1' || targetIP.includes(':')) {
          return { success: false, error: 'Invalid IP address: ' + targetIP };
        }
        
        // Warn about localhost connections
        if (targetIP === '127.0.0.1') {
          console.log('Warning: Connecting to localhost - this may not work for remote devices');
        }
        
        console.log('Attempting WebSocket connection to:', `ws://${targetIP}:${deviceInfo.port}`);
        
        // Create WebSocket connection to the remote device
        const ws = new WebSocket(`ws://${targetIP}:${deviceInfo.port}`);
        
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error('WebSocket connection timeout');
            ws.close();
            reject({ success: false, error: 'Connection timeout' });
          }, 10000); // 10 second timeout
          
          ws.on('open', () => {
            console.log('WebSocket connected to device');
            clearTimeout(timeout);
            this.remoteConnection = ws;
            
            // Send authentication request
            console.log('Attempting authentication with PIN:', remotePIN);
            
            ws.send(JSON.stringify({
              type: 'authenticate',
              pin: remotePIN
            }));
            
            resolve({ success: true });
          });
          
          ws.on('error', (error) => {
            console.error('WebSocket connection error:', error);
            clearTimeout(timeout);
            reject({ success: false, error: `WebSocket error: ${error.message || error}` });
          });
          
          ws.on('close', (code, reason) => {
            console.log('WebSocket connection closed:', code, reason);
            clearTimeout(timeout);
            this.remoteConnection = null;
          });
          
          ws.on('message', (message) => {
            try {
              const data = JSON.parse(message);
              this.handleRemoteMessage(data);
            } catch (error) {
              console.error('Invalid message from remote device:', error);
            }
          });
        });
      } catch (error) {
        console.error('Connection failed:', error);
        return { success: false, error: `Connection error: ${error.message || error}` };
      }
    });

    ipcMain.handle('get-pin', () => {
      return this.pin;
    });

    ipcMain.handle('get-connected-clients', () => {
      return this.connectedClients.size;
    });

    ipcMain.handle('disconnect-from-device', () => {
      if (this.remoteConnection) {
        this.remoteConnection.close();
        this.remoteConnection = null;
        console.log('Disconnected from remote device');
      }
      return { success: true };
    });

    ipcMain.handle('send-webrtc-message', (event, message) => {
      if (this.remoteConnection) {
        this.remoteConnection.send(JSON.stringify(message));
        console.log('WebRTC message sent:', message.type);
      } else {
        console.error('No remote connection available for WebRTC message');
      }
      return { success: true };
    });

    ipcMain.handle('start-screen-capture', async (event, sourceId) => {
      try {
        console.log('Starting screen capture for source:', sourceId);
        
        // Get the screen source
        const sources = await this.getScreenSources();
        const source = sources.find(s => s.id === sourceId);
        
        if (!source) {
          throw new Error('Screen source not found');
        }

        // Store the source for WebRTC streaming
        this.selectedSource = source;
        
        console.log('Screen capture source selected:', source.name);
        return source.id;
      } catch (error) {
        console.error('Failed to start screen capture:', error);
        throw error;
      }
    });
  }
}

// App event handlers
const localShareApp = new LocalShareApp();

app.whenReady().then(() => {
  localShareApp.createWindow();
  localShareApp.setupIPC();
  localShareApp.startDiscovery();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      localShareApp.createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  localShareApp.stopBroadcasting();
});
