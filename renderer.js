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

// Smoothing state
let smoothedGazeData = { x: 0, y: 0 };
let gazeHistory = [];
const SMOOTHING_FACTOR = 0.3;
const HISTORY_LENGTH = 5;
const MIN_MOVEMENT_THRESHOLD = 2;

// Smoothing functions
function smoothGazeData(rawX, rawY) {
  // Add to history
  gazeHistory.push({ x: rawX, y: rawY, timestamp: Date.now() });
  
  // Keep only recent history
  if (gazeHistory.length > HISTORY_LENGTH) {
    gazeHistory.shift();
  }
  
  // Calculate weighted average with more weight on recent data
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  
  for (let i = 0; i < gazeHistory.length; i++) {
    const weight = (i + 1) / gazeHistory.length; // More weight for recent data
    weightedX += gazeHistory[i].x * weight;
    weightedY += gazeHistory[i].y * weight;
    totalWeight += weight;
  }
  
  const averageX = weightedX / totalWeight;
  const averageY = weightedY / totalWeight;
  
  // Apply exponential smoothing
  smoothedGazeData.x = smoothedGazeData.x * (1 - SMOOTHING_FACTOR) + averageX * SMOOTHING_FACTOR;
  smoothedGazeData.y = smoothedGazeData.y * (1 - SMOOTHING_FACTOR) + averageY * SMOOTHING_FACTOR;
  
  return {
    x: smoothedGazeData.x,
    y: smoothedGazeData.y
  };
}

function shouldUpdateGaze(newX, newY, oldX, oldY) {
  const distance = Math.sqrt(Math.pow(newX - oldX, 2) + Math.pow(newY - oldY, 2));
  return distance >= MIN_MOVEMENT_THRESHOLD;
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
      imageDisplay.classList.add('tracking');
      
      // Create focus overlay
      createFocusOverlay();
      
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
      imageDisplay.classList.remove('tracking');
      
      // Remove focus overlay
      removeFocusOverlay();
      
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
    
    // Store original image source for clear drawing
    window.originalImageSrc = imagePath;
    
    // Update clear image if it exists
    if (window.clearImage) {
      window.clearImage.src = imagePath;
    }
    
    // Clear any existing focus overlay to prevent showing old image
    if (window.focusOverlay && window.focusCtx) {
      window.focusCtx.clearRect(0, 0, window.focusOverlay.width, window.focusOverlay.height);
    }
    
    fileName.textContent = path.basename(imagePath);
    updateImageRect();
  };
  img.src = imagePath;
}


// Create focus overlay
function createFocusOverlay() {
  if (!currentImage || window.focusOverlay) return;
  
  const overlay = document.createElement('canvas');
  overlay.id = 'focus-overlay';
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '999';
  
  const imageContainer = imageDisplay.parentElement;
  imageContainer.appendChild(overlay);
  
  window.focusOverlay = overlay;
  window.focusCtx = overlay.getContext('2d');
  
  // Create a hidden image element with the original unblurred image
  window.clearImage = new Image();
  window.clearImage.src = window.originalImageSrc;
  
  updateFocusOverlaySize();
}

// Remove focus overlay
function removeFocusOverlay() {
  if (window.focusOverlay) {
    window.focusOverlay.remove();
    window.focusOverlay = null;
    window.focusCtx = null;
    window.clearImage = null;
  }
}

// Update focus overlay size
function updateFocusOverlaySize() {
  if (!window.focusOverlay || !currentImage) return;
  
  const rect = imageDisplay.parentElement.getBoundingClientRect();
  window.focusOverlay.width = rect.width;
  window.focusOverlay.height = rect.height;
  window.focusOverlay.style.width = rect.width + 'px';
  window.focusOverlay.style.height = rect.height + 'px';
  window.focusOverlay.style.left = '0';
  window.focusOverlay.style.top = '0';
}

// Update image bounding rectangle
function updateImageRect() {
  if (currentImage) {
    imageRect = currentImage.getBoundingClientRect();
    updateFocusOverlaySize();
  }
}

// Handle window resize
window.addEventListener('resize', updateImageRect);

// Listen for gaze data
ipcRenderer.on('gaze-data', (event, data) => {
  // Skip invalid or zero coordinates early
  if (!data || !data.tracking || (data.x === 0 && data.y === 0)) {
    if (data && data.x === 0 && data.y === 0 && !gazeCoords.classList.contains('warning')) {
      gazeCoords.classList.add('warning');
      log('Warning: Receiving zero coordinates - check Tobii calibration', 'warning');
    }
    return;
  }
  
  // Only process if tracking is active
  if (!isTracking) {
    return;
  }
  
  // Apply smoothing to reduce jitter
  const smoothed = smoothGazeData(data.x, data.y);
  
  // Only update if movement is significant enough
  const lastX = lastGazeData ? lastGazeData.x : data.x;
  const lastY = lastGazeData ? lastGazeData.y : data.y;
  
  if (!shouldUpdateGaze(smoothed.x, smoothed.y, lastX, lastY) && lastGazeData) {
    return;
  }
  
  // Log significant changes only
  if (!lastGazeData || Math.abs(smoothed.x - lastX) > 20 || Math.abs(smoothed.y - lastY) > 20) {
    log(`Gaze data: Screen(${smoothed.x.toFixed(0)},${smoothed.y.toFixed(0)}) Tracking:${data.tracking}`);
  }
  
  lastGazeData = { x: smoothed.x, y: smoothed.y, tracking: data.tracking };
  gazeCoords.classList.remove('warning');
  
  // Update coordinates display with wave effect
  const waveEffect = generateWaveEffect(smoothed.x, smoothed.y);
  gazeCoords.textContent = `${waveEffect} Screen X: ${Math.round(smoothed.x)}, Y: ${Math.round(smoothed.y)} ${waveEffect}`;
  
  // Use window bounds from main process for accurate conversion
  const windowBounds = data.windowBounds || {
    x: window.screenX,
    y: window.screenY
  };
  
  // Convert screen coordinates to window coordinates
  const windowX = smoothed.x - windowBounds.x;
  const windowY = smoothed.y - windowBounds.y;
  
  // Get container rect relative to window (cache this if possible)
  const containerRect = imageDisplay.parentElement.getBoundingClientRect();
  
  // Calculate position within the container
  const containerX = windowX - containerRect.left;
  const containerY = windowY - containerRect.top;
  
  // Use requestAnimationFrame for smooth updates
  requestAnimationFrame(() => {
    // Update gaze pointer position
    gazePointer.style.left = `${containerX}px`;
    gazePointer.style.top = `${containerY}px`;
    
    // Update focus effect
    if (isTracking && window.focusOverlay) {
      drawFocusEffect(containerX, containerY);
    }
  });
});

// Draw focus effect on canvas
function drawFocusEffect(centerX, centerY) {
  const overlay = window.focusOverlay;
  const ctx = window.focusCtx;
  const clearImg = window.clearImage;
  
  if (!overlay || !ctx || !currentImage || !clearImg || !clearImg.complete) return;
  
  // Clear the overlay
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  
  // Save context state
  ctx.save();
  
  // Create circular clipping path
  const radius = 60;
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();
  
  // Get displayed dimensions and position
  const imgRect = currentImage.getBoundingClientRect();
  const containerRect = imageDisplay.parentElement.getBoundingClientRect();
  
  // Calculate image position relative to container
  const imgX = imgRect.left - containerRect.left;
  const imgY = imgRect.top - containerRect.top;
  
  // Draw the clear unblurred image
  ctx.drawImage(clearImg, imgX, imgY, imgRect.width, imgRect.height);
  
  // Add soft edge
  const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.7, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.8, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Restore context
  ctx.restore();
}


// Generate wave effect based on coordinates
function generateWaveEffect(x, y) {
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  
  // Normalize coordinates to 0-1 range
  const normalizedX = Math.max(0, Math.min(1, x / screenWidth));
  const normalizedY = Math.max(0, Math.min(1, y / screenHeight));
  
  // Create wave pattern based on position
  const waveIntensity = Math.floor(normalizedX * 10) + Math.floor(normalizedY * 5);
  const waveLength = Math.max(3, Math.min(15, waveIntensity));
  
  // Generate the wave lines
  const leftWave = '-'.repeat(waveLength);
  const rightWave = '-'.repeat(Math.max(1, 15 - waveLength));
  
  return `${leftWave} ${rightWave}`;
}

// Debug logging
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}\n`;
  debugLog.textContent += logEntry;
  debugLog.scrollTop = debugLog.scrollHeight;
  
  // Also log to console
  console.log(`[${type}]`, message);
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