const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building Windows application...');

try {
  // Clean previous builds
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
  }

  // Create dist directory
  fs.mkdirSync('dist', { recursive: true });

  // Build the app
  execSync('npx electron-builder --win --x64 --config.win.target=dir --config.win.sign=false --config.win.verifyUpdateCodeSignature=false --config.win.requestedExecutionLevel=asInvoker', {
    stdio: 'inherit',
    cwd: __dirname
  });

  console.log('✅ Windows build completed successfully!');
  console.log('📁 Build output: dist/win-unpacked/');
  console.log('🚀 You can now copy the "win-unpacked" folder to your Windows machine and run LocalShare.exe');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
