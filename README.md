# LocalShare - Local Screen Sharing App

A cross-platform screen sharing application built with Electron that allows you to share your screen across devices on the same local network.

## Features

- 🖥️ **Screen Capture**: Capture your entire screen or specific windows
- 🌐 **Local Network Discovery**: Automatically discover devices on your local network
- 📱 **Cross-Platform**: Works on Windows, macOS, and Linux
- 🔒 **Secure**: Local network only, no external servers required
- ⚡ **Real-time**: Low-latency screen sharing using WebRTC
- 🎨 **Modern UI**: Beautiful, responsive interface

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Building
```bash
npm run build
```

## How It Works

1. **Start Broadcasting**: Select a screen source and start broadcasting
2. **Device Discovery**: Other devices on the network will automatically discover your broadcast
3. **Connect**: Click "Connect" on any discovered device to start viewing
4. **View**: Watch the shared screen in real-time

## Technical Details

- **Electron**: Cross-platform desktop app framework
- **WebRTC**: Real-time communication for video streaming
- **mDNS**: Zero-configuration network discovery
- **WebSockets**: Control and metadata communication
- **Express**: HTTP server for device discovery

## Security

- Only works on local networks (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- No external servers or internet required
- Built-in encryption via WebRTC
- Optional PIN-based authentication

## Requirements

- Node.js 16+ 
- Electron 27+
- Local network connection

## Troubleshooting

### Screen Capture Permissions
- **macOS**: Grant screen recording permissions in System Preferences > Security & Privacy
- **Windows**: Run as administrator if needed
- **Linux**: Ensure proper X11/Wayland permissions

### Network Issues
- Ensure all devices are on the same local network
- Check firewall settings
- Verify mDNS/Bonjour is working

## License

MIT License - feel free to use and modify as needed.
# localshare
