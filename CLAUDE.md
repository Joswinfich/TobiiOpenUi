# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm start` - Start the Electron application
- `npm run dev` - Start with DevTools enabled for debugging  

### Gaze Monitoring
- `npm run gaze` - Single read of eye tracking coordinates from command line
- `npm run gaze-watch` - Continuous monitoring of coordinates (press Ctrl+C to exit)

### Installation
- `npm install` - Install dependencies (only Electron required)

## Architecture

This is an Electron-based eye tracking application that integrates with Talon and Tobii 5 eye trackers to provide visual gaze feedback on images.

### Core Components

**Main Process (`main.js`)**
- Creates fullscreen borderless window with Node.js integration
- Handles IPC communication for file dialogs and eye tracking control
- Reads gaze data from `~/talon_gaze_data.json` at 50fps (~20ms intervals)
- Manages gaze data polling lifecycle and provides window bounds for coordinate conversion

**Renderer Process (`renderer.js`)**
- UI logic and gaze visualization
- Applies smoothing algorithms to reduce gaze jitter (exponential smoothing + weighted history)
- Implements focus effect with dynamic blur overlay using HTML5 Canvas
- Manages draggable debug and settings panels
- Provides real-time gaze grid visualization (16x9 grid with fading trail)

**Standalone Gaze Monitor (`gaze-monitor.js`)**
- Command-line utility for debugging gaze coordinates
- Can run in single-read or continuous monitoring modes
- Independent of the Electron app for troubleshooting

### Integration Dependencies

**External Requirements:**
- Talon voice control software must be running
- Tobii 5 eye tracker must be connected and calibrated  
- Talon script writes gaze data to `~/talon_gaze_data.json`

### Key Features

**Gaze Processing Pipeline:**
1. Raw coordinates from Talon → JSON file
2. Electron polls file every 20ms
3. Renderer applies smoothing (history buffer + exponential smoothing)
4. Screen coordinates converted to window-relative coordinates
5. Visual feedback via red dot pointer and blur focus effect

**Visual Effects:**
- Image blur with clear focus circle following gaze
- Configurable blur amount (0-20px) and focus radius (50-200px)
- Real-time coordinate display with wave effect animation
- Mini gaze grid showing movement trail with 2-second fade

**UI Architecture:**
- Fullscreen borderless window for immersive experience
- Floating draggable panels for debug logs and settings
- Status indicators for Talon connection and tracking state
- File dialog integration for image selection

### Data Flow

1. Talon → `~/talon_gaze_data.json` (external process)
2. Main process polls file → IPC to renderer
3. Renderer smooths data → Updates UI elements
4. Canvas overlay renders focus effect in real-time

### Development Notes

- Uses Node.js integration with `contextIsolation: false` for direct access
- Coordinate system conversion from screen to window to container coordinates
- Performance optimized with `requestAnimationFrame` for smooth 50fps updates
- Handles partial file reads and JSON parse errors gracefully