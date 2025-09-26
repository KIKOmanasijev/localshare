console.log('Starting Electron test...');

try {
  const electron = require('electron');
  console.log('Electron module loaded:', typeof electron);
  console.log('Electron keys:', Object.keys(electron));
  
  const { app } = electron;
  console.log('app:', typeof app);
  
  if (app) {
    console.log('app.whenReady:', typeof app.whenReady);
    console.log('Success! App is available');
  } else {
    console.log('ERROR: app is undefined');
  }
} catch (error) {
  console.error('Error loading Electron:', error);
}
