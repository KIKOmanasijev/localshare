const fs = require('fs');
const path = require('path');

console.log('Creating Windows package...');

// Create the package structure
const packageDir = path.join(__dirname, 'dist', 'LocalShare-Windows');
const srcDir = path.join(packageDir, 'src');

// Create directories
fs.mkdirSync(packageDir, { recursive: true });
fs.mkdirSync(srcDir, { recursive: true });

// Copy source files
const copyRecursive = (src, dest) => {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);
    files.forEach(file => {
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};

// Copy src directory
copyRecursive(path.join(__dirname, 'src'), srcDir);

// Copy package.json
fs.copyFileSync(path.join(__dirname, 'package.json'), path.join(packageDir, 'package.json'));

// Create a simple batch file to run the app
const batchContent = `@echo off
echo Starting LocalShare...
echo.
echo Installing dependencies...
npm install --production
echo.
echo Starting LocalShare...
npm start
pause`;

fs.writeFileSync(path.join(packageDir, 'run.bat'), batchContent);

// Create a README for Windows
const readmeContent = `# LocalShare - Windows Package

## How to run:

1. Make sure you have Node.js installed on your Windows machine
2. Double-click "run.bat" to start the application
3. The app will install dependencies and start automatically

## Alternative method:

1. Open Command Prompt in this folder
2. Run: npm install
3. Run: npm start

## Features:

- Local network screen sharing
- WebRTC video streaming
- mDNS device discovery
- PIN-based authentication

## Requirements:

- Node.js (version 16 or higher)
- Windows 10 or later
- Network connection

Enjoy using LocalShare!
`;

fs.writeFileSync(path.join(packageDir, 'README.txt'), readmeContent);

console.log('✅ Windows package created successfully!');
console.log('📁 Package location: dist/LocalShare-Windows/');
console.log('📋 Instructions:');
console.log('1. Copy the "LocalShare-Windows" folder to your Windows machine');
console.log('2. Make sure Node.js is installed on Windows');
console.log('3. Double-click "run.bat" to start the app');
console.log('4. Or run "npm install" then "npm start" in Command Prompt');
