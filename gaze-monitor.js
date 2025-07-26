#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const gazeDataPath = path.join(os.homedir(), 'talon_gaze_data.json');
const refreshRate = 50; // milliseconds

// Command line arguments
const args = process.argv.slice(2);
const continuousMode = args.includes('--continuous') || args.includes('-c');
const helpRequested = args.includes('--help') || args.includes('-h');

// Help text
function showHelp() {
  console.log(`
Tobii Gaze Monitor - Command Line Eye Tracking Coordinate Reader

Usage:
  node gaze-monitor.js [options]

Options:
  -c, --continuous    Monitor coordinates continuously (default: single read)
  -h, --help          Show this help message

Examples:
  node gaze-monitor.js                    # Single coordinate read
  node gaze-monitor.js --continuous       # Continuous monitoring
  node gaze-monitor.js -c                 # Continuous monitoring (short)

Notes:
  - Requires Talon to be running with eye tracking enabled
  - Data is read from: ${gazeDataPath}
  - Press Ctrl+C to exit continuous mode
`);
}

// Read gaze data from file
function readGazeData() {
  try {
    if (!fs.existsSync(gazeDataPath)) {
      return { error: 'Talon gaze data file not found. Make sure Talon is running and eye tracking is enabled.' };
    }

    const data = fs.readFileSync(gazeDataPath, 'utf8');
    if (!data || !data.trim()) {
      return { error: 'No gaze data available' };
    }

    const gazeData = JSON.parse(data);
    
    // Check if tracking is active
    if (!gazeData.tracking) {
      return { error: 'Eye tracking not active' };
    }

    // Check for valid coordinates
    if (gazeData.x === 0 && gazeData.y === 0) {
      return { error: 'Invalid coordinates (0,0) - check Tobii calibration' };
    }

    return {
      x: Math.round(gazeData.x),
      y: Math.round(gazeData.y),
      tracking: gazeData.tracking
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { error: 'Invalid gaze data format' };
    }
    return { error: `Failed to read gaze data: ${error.message}` };
  }
}

// Single read mode
function singleRead() {
  const result = readGazeData();
  
  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
  
  console.log(`X: ${result.x}, Y: ${result.y}`);
}

// Continuous monitoring mode
function continuousMonitor() {
  console.log('Monitoring gaze coordinates... (Press Ctrl+C to exit)');
  console.log('');
  
  let lastOutput = '';
  
  const monitor = setInterval(() => {
    const result = readGazeData();
    
    let output;
    if (result.error) {
      output = `Error: ${result.error}`;
    } else {
      output = `X: ${result.x}, Y: ${result.y}`;
    }
    
    // Only update if output changed to reduce flicker
    if (output !== lastOutput) {
      // Clear the current line and move cursor to beginning
      process.stdout.write('\r\x1b[K');
      process.stdout.write(output);
      lastOutput = output;
    }
  }, refreshRate);
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    clearInterval(monitor);
    console.log('\n\nMonitoring stopped.');
    process.exit(0);
  });
}

// Main execution
function main() {
  if (helpRequested) {
    showHelp();
    return;
  }
  
  if (continuousMode) {
    continuousMonitor();
  } else {
    singleRead();
  }
}

// Run the program
main();