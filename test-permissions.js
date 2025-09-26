import { desktopCapturer } from 'electron';

console.log('Testing screen capture permissions...');

try {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 240 }
  });
  
  console.log('Found sources:', sources.length);
  sources.forEach((source, index) => {
    console.log(`${index + 1}. ${source.name} (${source.id})`);
  });
  
  if (sources.length === 0) {
    console.log('❌ No screen sources found. This usually means:');
    console.log('1. Screen recording permissions not granted');
    console.log('2. App not running through Electron');
    console.log('3. macOS security restrictions');
  } else {
    console.log('✅ Screen capture is working!');
  }
} catch (error) {
  console.error('Error getting screen sources:', error.message);
}
