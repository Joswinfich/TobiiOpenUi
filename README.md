# Tobii Open UI

An open-source eye tracking interface that integrates with Talon and your Tobii 5 eye tracker to provide visual eye tracking on images.

## Prerequisites

1. **Talon** must be installed and running on your system
2. **Tobii 5** eye tracker must be connected and calibrated
3. Node.js and npm installed

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Make sure Talon is running and your Tobii 5 is connected

3. Enable eye tracking in Talon by saying: **"start eye tracking"**

## Running the Application

```bash
npm start
```

For development mode with DevTools:
```bash
npm run dev
```

## Usage

1. Click "select image file" to choose an image to track
2. Make sure Talon shows as "Connected" in the status bar
3. Click "start eye tracking" to begin tracking your gaze
4. Your gaze will be shown as:
   - A red dot following your eyes
   - A yellow highlight region on the image where you're looking
5. Click "stop tracking" to pause eye tracking

## How It Works

The application uses Talon's gaze control system to access your Tobii 5 eye tracker. The Talon script (`~/.talon/user/eye_tracking_app/talon_eye_tracker.py`) captures gaze data and writes it to a JSON file that this Electron app reads in real-time.

## Troubleshooting

- If Talon shows "Not Connected", make sure:
  - To restart talon with application running.
  - selected only eye tracking and not head tracking.


