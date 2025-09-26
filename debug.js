const { app, BrowserWindow } = require('electron');

console.log('app:', app);
console.log('BrowserWindow:', BrowserWindow);

if (app) {
  console.log('app.whenReady:', app.whenReady);
} else {
  console.log('app is undefined!');
}
