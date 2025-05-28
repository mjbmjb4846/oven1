const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
let control;

// State variables
let mainWindow;
let pressureMonitoringInterval;
let targetTemperature = 150;
let currentTemperature = 25;
let systemActive = false;
let recordingActive = false;
let firstRun = true;

// Check for native modules on startup
function checkNativeModules() {
  try {
    // First try to load the control module
    control = require('./control');
    return true;
  } catch (error) {
    console.error('Error loading GPIO control module:', error.message);
    
    // If we're in development mode, this is fine
    if (process.platform !== 'linux' || (process.arch !== 'arm' && process.arch !== 'arm64')) {
      console.log('Running in development mode, using simulated GPIO');
      control = require('./control');
      return true;
    }
    
    // Check if we need to install native modules
    const resourcesPath = path.join(process.resourcesPath || __dirname, 'resources');
    const installScript = path.join(resourcesPath, 'install-native-modules.sh');
    
    if (fs.existsSync(installScript)) {
      try {
        console.log('Installing native modules...');
        fs.chmodSync(installScript, '755');
        execSync(installScript, { stdio: 'inherit' });
        
        // Try loading control module again
        control = require('./control');
        return true;
      } catch (installError) {
        console.error('Failed to install native modules:', installError.message);
        return false;
      }
    }
    
    return false;
  }
}

// Create the main window
function createWindow(filePath, width, height) {
    const win = new BrowserWindow({
        width: width || undefined,
        height: height || undefined,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        menuBarVisible: false,
        frame: false,                          // Remove default window frame
        titleBarStyle: 'customButtonsOnHover', // Show window controls on hover
        titleBarOverlay: {
            color: '#2f3241',
            symbolColor: '#FFFFFF',
            height: 30
        },
        icon: path.join(__dirname, 'build/icon.png')
    });

    // Remove menu bar completely
    win.setMenu(null);

    if (!width || !height) {
        win.maximize();
    }

    win.loadFile(filePath);
    return win;
}

// Initialize the application
app.whenReady().then(() => {
    // Check for native modules first
    const modulesLoaded = checkNativeModules();
    
    if (!modulesLoaded) {
        dialog.showErrorBox(
            'Native Module Error',
            'Failed to load GPIO libraries. The app will run in simulation mode.'
        );
    }
    
    // Initialize GPIO
    const gpioInitialized = control.initializeGPIO();
    console.log(`GPIO initialization ${gpioInitialized ? 'successful' : 'failed'}`);
    
    // Create the main window with the interface
    mainWindow = createWindow('interface.html');
    
    // Handle window closing
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    
    // Initialize data recording
    initializeDataRecording();
    
    // Set up IPC communication
    setupIPC();
    
    // Send simulation mode status to the renderer
    mainWindow.webContents.on('did-finish-load', () => {
        // Use isCompatibleBoard from control.js instead of the old isRaspberryPi
        const isSimulationMode = !control.isCompatibleBoard || 
                               (!gpioInitialized && control.isCompatibleBoard);
        mainWindow.webContents.send('simulation-mode', isSimulationMode);
        
        // Send board information if available
        if (control.boardInfo) {
            mainWindow.webContents.send('board-info', {
                type: control.boardInfo.type,
                model: control.boardInfo.model,
                gpioLibrary: control.boardInfo.gpioLibrary
            });
        }
    });
});

// Initialize data recording
function initializeDataRecording() {
    // Setup CSV recording with default interval (5 seconds)
    control.initializeDataRecording();
    
    // Start recording data
    control.startDataRecording((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('recording-data', data);
        }
    }, 5);
    
    recordingActive = true;
}

// Quit when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle macOS dock click
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow('interface.html');
    }
});

// Clean up resources when quitting
app.on('before-quit', () => {
    // Stop monitoring
    if (pressureMonitoringInterval) {
        control.stopPressureMonitoring(pressureMonitoringInterval);
    }
    
    // Stop data recording
    control.stopDataRecording();
    
    // Clean up GPIO resources
    control.cleanupGPIO();
    
    console.log('Application shutting down, resources cleaned up');
});

// Set up IPC communication between renderer and main processes
function setupIPC() {
    // Handle temperature setting
    ipcMain.on('set-temperature', (event, temp) => {
        console.log(`Setting target temperature to ${temp}°C`);
        targetTemperature = temp;
    });
    
    // Handle heating elements control
    ipcMain.on('set-heating', (event, isOn) => {
        console.log(`Setting heating elements ${isOn ? 'ON' : 'OFF'}`);
        control.setHeatingElements(isOn);
    });
    
    // Handle fan control
    ipcMain.on('set-fan', (event, speed) => {
        console.log(`Setting fan speed to ${speed}%`);
        control.setFanSpeed(speed);
    });
    
    // Handle solenoid valve control
    ipcMain.on('set-solenoid', (event, isOpen) => {
        console.log(`Setting solenoid valve ${isOpen ? 'OPEN' : 'CLOSED'}`);
        control.setSolenoidValve(isOpen);
    });
    
    // Handle steam level setting
    ipcMain.on('set-steam-level', (event, level) => {
        console.log(`Setting steam level to ${level}%`);
        // In a more advanced implementation, this could control steam intensity
    });
    
    // Handle recording interval change
    ipcMain.on('set-recording-interval', (event, interval) => {
        console.log(`Setting recording interval to ${interval} seconds`);
        control.updateRecordingInterval(interval);
        
        // Confirm the change to the renderer
        mainWindow.webContents.send('recording-interval-updated', interval);
    });
    
    // Handle system start
    ipcMain.on('start-system', (event) => {
        console.log('Starting oven system');
        systemActive = true;
        
        // Start pressure monitoring
        pressureMonitoringInterval = control.startPressureMonitoring((pressure) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('pressure-reading', pressure);
            }
        }, 2000);
        
        // Start temperature control simulation
        startTemperatureControl();
    });
    
    // Handle system stop
    ipcMain.on('stop-system', (event) => {
        console.log('Stopping oven system');
        systemActive = false;
        
        // Turn off all controls but keep monitoring
        control.setHeatingElements(false);
        control.setFanSpeed(0);
        control.setSolenoidValve(false);
        
        // We deliberately don't stop pressure monitoring or temperature recording
        // to allow tracking as the system cools down
    });
    
    // Handle data updates from renderer
    ipcMain.on('update-data', (event, data) => {
        // Process any data sent from the renderer
        if (data.temperature) {
            currentTemperature = data.temperature;
        }
    });
}

// Simulate temperature control
function startTemperatureControl() {
    const temperatureInterval = setInterval(() => {
        if (!systemActive) {
            clearInterval(temperatureInterval);
            return;
        }
        
        // Get temperature from probe if on compatible board, otherwise simulate
        if (control.isCompatibleBoard && control.boardInfo && control.boardInfo.gpioLibrary) {
            currentTemperature = control.readTemperatureProbe();
        } else {
            // Simulate temperature changes based on heating elements and target temp
            currentTemperature = control.simulateTemperatureControl(targetTemperature, currentTemperature);
        }
        
        // Send temperature reading to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('temperature-reading', currentTemperature);
        }
    }, 1000);
}