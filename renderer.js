const { ipcRenderer } = require('electron');
const path = require('path');

// Elements
const selectImageBtn = document.getElementById('selectImageBtn');
const startTrackingBtn = document.getElementById('startTrackingBtn');
const stopTrackingBtn = document.getElementById('stopTrackingBtn');
const fileName = document.getElementById('fileName');
const imageDisplay = document.getElementById('imageDisplay');
const gazePointer = document.getElementById('gazePointer');
const talonStatus = document.getElementById('talonStatus');
const trackingStatus = document.getElementById('trackingStatus');
const gazeCoords = document.getElementById('gazeCoords');
const retryBtn = document.getElementById('retryBtn');
const debugLog = document.getElementById('debugLog');
const clearLogBtn = document.getElementById('clearLogBtn');

// State
let isTracking = false;
let currentImage = null;
let imageRect = null;
let lastGazeData = null;

// Debug logging
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}\n`;
  debugLog.textContent += logEntry;
  debugLog.scrollTop = debugLog.scrollHeight;
  
  // Also log to console
  console.log(`[${type}]`, message);
}

// Event listeners
selectImageBtn.addEventListener('click', async () => {
  const imagePath = await ipcRenderer.invoke('select-image');
  if (imagePath) {
    loadImage(imagePath);
    log(`Image loaded: ${path.basename(imagePath)}`);
  }
});

startTrackingBtn.addEventListener('click', async () => {
  if (!isTracking) {
    log('Starting eye tracking...');
    const started = await ipcRenderer.invoke('start-tracking');
    if (started) {
      isTracking = true;
      startTrackingBtn.disabled = true;
      stopTrackingBtn.disabled = false;
      trackingStatus.textContent = 'Tracking: Active';
      trackingStatus.classList.remove('error');
      gazePointer.classList.add('active');
      log('Eye tracking started successfully');
    } else {
      log('Failed to start eye tracking', 'error');
    }
  }
});

stopTrackingBtn.addEventListener('click', async () => {
  if (isTracking) {
    log('Stopping eye tracking...');
    const stopped = await ipcRenderer.invoke('stop-tracking');
    if (stopped) {
      isTracking = false;
      startTrackingBtn.disabled = false;
      stopTrackingBtn.disabled = true;
      trackingStatus.textContent = 'Tracking: Off';
      gazePointer.classList.remove('active');
      removeHighlightRegions();
      log('Eye tracking stopped');
    }
  }
});

retryBtn.addEventListener('click', async () => {
  log('Retrying Talon connection...');
  await checkTalonStatus();
  
  // Also try to restart the Talon script
  const result = await ipcRenderer.invoke('restart-talon-script');
  if (result.success) {
    log('Talon script restart command sent');
  } else {
    log(`Failed to restart Talon script: ${result.error}`, 'error');
  }
});

clearLogBtn.addEventListener('click', () => {
  debugLog.textContent = '';
  log('Debug log cleared');
});

// Load and display image
function loadImage(imagePath) {
  const img = new Image();
  img.onload = () => {
    imageDisplay.innerHTML = '';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    imageDisplay.appendChild(img);
    currentImage = img;
    fileName.textContent = path.basename(imagePath);
    updateImageRect();
  };
  img.src = imagePath;
}

// Update image bounding rectangle
function updateImageRect() {
  if (currentImage) {
    imageRect = currentImage.getBoundingClientRect();
  }
}

// Handle window resize
window.addEventListener('resize', updateImageRect);

// Listen for gaze data
ipcRenderer.on('gaze-data', (event, data) => {
  // Log first gaze data or significant changes
  if (!lastGazeData || Math.abs(data.x - (lastGazeData.x || 0)) > 10 || Math.abs(data.y - (lastGazeData.y || 0)) > 10) {
    log(`Gaze data: Screen(${data.x.toFixed(0)},${data.y.toFixed(0)}) Tracking:${data.tracking} Connected:${data.tracker_connected}`);
    if (data.windowBounds) {
      log(`Window position: (${data.windowBounds.x},${data.windowBounds.y}) Size:(${data.windowBounds.width}x${data.windowBounds.height})`);
    }
  }
  
  lastGazeData = data;
  
  if (isTracking && data.tracking) {
    // Update coordinates display with screen coordinates
    gazeCoords.textContent = `Screen X: ${Math.round(data.x)}, Y: ${Math.round(data.y)}`;
    
    // Check if coordinates are non-zero
    if (data.x === 0 && data.y === 0) {
      if (!gazeCoords.classList.contains('warning')) {
        gazeCoords.classList.add('warning');
        log('Warning: Receiving zero coordinates - check Tobii calibration', 'warning');
      }
    } else {
      gazeCoords.classList.remove('warning');
    }
    
    // Use window bounds from main process for accurate conversion
    const windowBounds = data.windowBounds || {
      x: window.screenX,
      y: window.screenY
    };
    
    // Convert screen coordinates to window coordinates
    const windowX = data.x - windowBounds.x;
    const windowY = data.y - windowBounds.y;
    
    // Get container rect relative to window
    const containerRect = imageDisplay.parentElement.getBoundingClientRect();
    
    // Calculate position within the container
    const containerX = windowX - containerRect.left;
    const containerY = windowY - containerRect.top;
    
    // Update gaze pointer position
    gazePointer.style.left = `${containerX}px`;
    gazePointer.style.top = `${containerY}px`;
    
    // Update highlight if over image
    if (currentImage && imageRect) {
      // Check if gaze is within the image bounds
      const imageX = windowX - imageRect.left;
      const imageY = windowY - imageRect.top;
      
      if (imageX >= 0 && imageX <= imageRect.width &&
          imageY >= 0 && imageY <= imageRect.height) {
        updateHighlightRegion(containerX, containerY);
      } else {
        removeHighlightRegions();
      }
    }
  }
});

// Create highlight region around gaze point
function updateHighlightRegion(x, y) {
  let highlight = document.querySelector('.highlight-region');
  if (!highlight) {
    highlight = document.createElement('div');
    highlight.className = 'highlight-region';
    imageDisplay.parentElement.appendChild(highlight);
  }
  
  const size = 100;
  highlight.style.width = `${size}px`;
  highlight.style.height = `${size}px`;
  highlight.style.left = `${x - size/2}px`;
  highlight.style.top = `${y - size/2}px`;
}

function removeHighlightRegions() {
  const highlights = document.querySelectorAll('.highlight-region');
  highlights.forEach(h => h.remove());
}

// Check Talon status periodically
async function checkTalonStatus() {
  const status = await ipcRenderer.invoke('check-talon-status');
  if (status.connected) {
    talonStatus.textContent = 'Talon: Connected';
    talonStatus.classList.remove('error', 'warning');
    if (!talonStatus.dataset.wasConnected) {
      log(`Talon connected! Data file: ${status.path}`);
      talonStatus.dataset.wasConnected = 'true';
    }
  } else {
    talonStatus.textContent = 'Talon: Not Connected';
    talonStatus.classList.add('warning');
    if (talonStatus.dataset.wasConnected === 'true') {
      log(`Talon disconnected. Last update: ${status.lastUpdate || 'Never'}`, 'warning');
      log('Make sure to say "start eye tracking" in Talon', 'warning');
      talonStatus.dataset.wasConnected = 'false';
    }
  }
}

// Initial setup
stopTrackingBtn.disabled = true;
log('Eye Tracker App initialized');
log('Checking Talon connection...');
checkTalonStatus();
setInterval(checkTalonStatus, 2000);

// Log initial instructions
log('Instructions:', 'info');
log('1. Make sure Talon is running', 'info');
log('2. Say "start eye tracking" in Talon to enable gaze control', 'info');
log('3. Check that your Tobii 5 is connected and calibrated', 'info');
log('4. Click "Retry Connection" if having issues', 'info');