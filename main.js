const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let gazeDataPath = path.join(require('os').homedir(), 'talon_gaze_data.json');
let gazeInterval;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#1a1a1a'
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (gazeInterval) {
      clearInterval(gazeInterval);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('start-tracking', () => {
  // Start reading gaze data from Talon
  gazeInterval = setInterval(() => {
    try {
      if (fs.existsSync(gazeDataPath)) {
        const data = fs.readFileSync(gazeDataPath, 'utf8');
        if (data && data.trim()) {
          try {
            const gazeData = JSON.parse(data);
            // Add window bounds to help with coordinate conversion
            const bounds = mainWindow.getBounds();
            gazeData.windowBounds = bounds;
            mainWindow.webContents.send('gaze-data', gazeData);
          } catch (parseError) {
            // Ignore parse errors - file might be partially written
          }
        }
      }
    } catch (error) {
      // Silently ignore read errors
    }
  }, 20); // ~50fps - slightly reduced for better performance while maintaining smoothness
  
  return true;
});

ipcMain.handle('stop-tracking', () => {
  if (gazeInterval) {
    clearInterval(gazeInterval);
    gazeInterval = null;
  }
  return true;
});

ipcMain.handle('check-talon-status', () => {
  // Check if Talon gaze data file exists and is recent
  try {
    if (fs.existsSync(gazeDataPath)) {
      const stats = fs.statSync(gazeDataPath);
      const lastModified = new Date(stats.mtime);
      const now = new Date();
      const diffSeconds = (now - lastModified) / 1000;
      
      // If file was modified in last 5 seconds, consider Talon active
      return {
        connected: diffSeconds < 5,
        lastUpdate: lastModified,
        path: gazeDataPath
      };
    }
  } catch (error) {
    console.error('Error checking Talon status:', error);
  }
  
  return {
    connected: false,
    lastUpdate: null,
    path: gazeDataPath
  };
});

ipcMain.handle('restart-talon-script', async () => {
  try {
    // Check if Talon gaze data file exists
    if (fs.existsSync(gazeDataPath)) {
      // Touch the file to trigger a refresh
      const now = new Date();
      fs.utimesSync(gazeDataPath, now, now);
      console.log('Triggered Talon data file refresh');
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});