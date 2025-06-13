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

// Enhanced state variables for comprehensive logging
let fanSpeed = 0;
let steamLevel = 0;
let heatingElementsOn = false;
let solenoidValveOpen = false;
let timerEnabled = false;
let timerActive = false;
let timerRemainingSeconds = 0;
let timerTotalSeconds = 0;
let sessionStartTime = new Date();
let lastSystemStartTime = null;

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
            contextIsolation: false,
            sandbox: false,
            // webSecurity: false,  // Disable web security for local development
            // allowRunningInsecureContent: true,  // Allow local content
            // experimentalFeatures: true  // Enable experimental web features
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

// Disable sandbox for Linux/ARM compatibility
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('--no-sandbox');
    app.commandLine.appendSwitch('--disable-setuid-sandbox');
    app.commandLine.appendSwitch('--disable-dev-shm-usage');
    app.commandLine.appendSwitch('--disable-gpu-sandbox');
    
    // Specifically for ARM devices - additional compatibility flags
    // if (process.arch === 'arm' || process.arch === 'arm64') {
    //     app.commandLine.appendSwitch('--disable-gpu');
    //     app.commandLine.appendSwitch('--disable-gpu-compositing');
    //     app.commandLine.appendSwitch('--disable-software-rasterizer');
    //     app.commandLine.appendSwitch('--disable-features=VizDisplayCompositor');
    //     app.commandLine.appendSwitch('--use-gl=swiftshader');
    // }
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
    
    // Start continuous temperature monitoring immediately
    startContinuousTemperatureMonitoring();
    
    // Start continuous pressure monitoring immediately
    pressureMonitoringInterval = control.startPressureMonitoring((pressure) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('pressure-reading', pressure);
        }
    }, 2000);
    
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
    // Load saved settings first
    loadAppSettings();
    
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

// Load application settings
function loadAppSettings() {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    
    try {
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            
            // Apply CSV storage path if available
            if (settings.csvStoragePath) {
                // Verify the folder still exists and is accessible
                if (fs.existsSync(settings.csvStoragePath)) {
                    try {
                        // Test write access
                        const testFile = path.join(settings.csvStoragePath, '.test_write');
                        fs.writeFileSync(testFile, 'test');
                        fs.unlinkSync(testFile);
                        
                        // Path is valid, set it in control module
                        control.setCustomStoragePath(settings.csvStoragePath);
                        console.log(`Loaded CSV storage path: ${settings.csvStoragePath}`);
                        
                        // Send the path to renderer when the window is ready
                        if (mainWindow && mainWindow.webContents) {
                            mainWindow.webContents.once('did-finish-load', () => {
                                mainWindow.webContents.send('storage-folder-updated', settings.csvStoragePath);
                            });
                        }
                    } catch (error) {
                        console.log(`Saved storage path is not writable, using default: ${error.message}`);
                    }
                } else {
                    console.log('Saved storage path no longer exists, using default');
                }
            }
        }
    } catch (error) {
        console.log(`Could not load settings: ${error.message}`);
    }
}

// Start continuous temperature monitoring (separate from system control)
function startContinuousTemperatureMonitoring() {
    if (temperatureMonitoringInterval) {
        clearInterval(temperatureMonitoringInterval);
    }
    
    temperatureMonitoringInterval = setInterval(() => {
        // Get temperature from probe if on compatible board, otherwise simulate
        if (control.isCompatibleBoard && control.boardInfo && control.boardInfo.gpioLibrary) {
            currentTemperature = control.readTemperatureProbe();
        } else {
            // In development mode, provide realistic temperature simulation based on system state
            if (systemActive) {
                // When system is active, use the full heating/cooling simulation
                currentTemperature = control.simulateTemperatureControl(targetTemperature, currentTemperature);
            } else {
                // When system is inactive, simulate natural cooling or just show temperature with variations
                // If temperature is above room temperature, cool down, otherwise show variations around room temp
                if (currentTemperature > 25) {
                    currentTemperature = simulateNaturalCooling(currentTemperature);
                } else {
                    // Use the probe simulation for realistic variations around room temperature
                    currentTemperature = control.readTemperatureProbe();
                }
            }        }
        
        // Update control module with current temperature for CSV recording
        control.updateCurrentTemperature(currentTemperature);
        
        // Always send temperature reading to renderer for chart display
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('temperature-reading', currentTemperature);
        }
    }, 1000);
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
    // Stop temperature monitoring
    if (temperatureMonitoringInterval) {
        clearInterval(temperatureMonitoringInterval);
        temperatureMonitoringInterval = null;
    }
    
    // Stop pressure monitoring
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
function setupIPC() {    // Handle temperature setting
    ipcMain.on('set-temperature', (event, temp) => {
        console.log(`Setting target temperature to ${temp}°C`);
        targetTemperature = temp;
        
        // Update control module state
        control.updateSystemState({ targetTemp: temp });
    });
      // Handle heating elements control
    ipcMain.on('set-heating', (event, isOn) => {
        console.log(`Setting heating elements ${isOn ? 'ON' : 'OFF'}`);
        heatingElementsOn = isOn;
        control.setHeatingElements(isOn);
        
        // Update control module state
        control.updateSystemState({ heatingElementsOn: isOn });
    });
    
    // Handle fan control
    ipcMain.on('set-fan', (event, speed) => {
        console.log(`Setting fan speed to ${speed}%`);
        fanSpeed = speed;
        control.setFanSpeed(speed);
        
        // Update control module state
        control.updateSystemState({ fanSpeed: speed });
    });
    
    // Handle solenoid valve control
    ipcMain.on('set-solenoid', (event, isOpen) => {
        console.log(`Setting solenoid valve ${isOpen ? 'OPEN' : 'CLOSED'}`);
        solenoidValveOpen = isOpen;
        control.setSolenoidValve(isOpen);
        
        // Update control module state
        control.updateSystemState({ solenoidValveOpen: isOpen });
    });
    
    // Handle steam level setting
    ipcMain.on('set-steam-level', (event, level) => {
        console.log(`Setting steam level to ${level}%`);
        steamLevel = level;
        
        // Update control module state
        control.updateSystemState({ steamLevel: level });
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
        
        // Update control module state
        control.updateSystemState({ 
            systemActive: true,
            targetTemp: targetTemperature 
        });
        
        // Note: Pressure and temperature monitoring are already running continuously
        // No need to start additional monitoring here
    });
    
    // Handle system stop
    ipcMain.on('stop-system', (event) => {
        console.log('Stopping oven system');
        systemActive = false;
        
        // Turn off all controls but keep monitoring
        heatingElementsOn = false;
        fanSpeed = 0;
        solenoidValveOpen = false;
        steamLevel = 0;
        
        control.setHeatingElements(false);
        control.setFanSpeed(0);
        control.setSolenoidValve(false);
        
        // Update control module state
        control.updateSystemState({ 
            systemActive: false,
            heatingElementsOn: false,
            fanSpeed: 0,
            solenoidValveOpen: false,
            steamLevel: 0
        });
        
        // We deliberately don't stop pressure monitoring or temperature recording
        // to allow tracking as the system cools down
    });
    
    // Handle timer state updates
    ipcMain.on('timer-state', (event, timerState) => {
        console.log('Timer state update:', timerState);
        
        // Update local timer state
        if (timerState.enabled !== undefined) timerEnabled = timerState.enabled;
        if (timerState.active !== undefined) timerActive = timerState.active;
        if (timerState.remaining !== undefined) timerRemainingSeconds = timerState.remaining;
        if (timerState.total !== undefined) timerTotalSeconds = timerState.total;
        
        // Update control module timer state
        control.updateTimerState(timerState);
    });
      // Handle data updates from renderer
    ipcMain.on('update-data', (event, data) => {
        // Process any data sent from the renderer
        if (data.temperature) {
            currentTemperature = data.temperature;
        }
    });

    // Handle storage folder selection
    ipcMain.on('select-storage-folder', (event) => {
        const result = dialog.showOpenDialogSync(mainWindow, {
            title: 'Select CSV Storage Folder',
            properties: ['openDirectory', 'createDirectory'],
            buttonLabel: 'Select Folder'
        });

        if (result && result.length > 0) {
            const selectedPath = result[0];
            
            // Store the selected path in app settings
            app.getPath('userData');
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            
            let settings = {};
            try {
                if (fs.existsSync(settingsPath)) {
                    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                }
            } catch (error) {
                console.log('Could not read settings file, using defaults');
                settings = {};
            }
            
            settings.csvStoragePath = selectedPath;
            
            try {
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
                console.log(`CSV storage folder set to: ${selectedPath}`);
                
                // Update control module with new path
                control.setCustomStoragePath(selectedPath);
                
                // Notify renderer of the update
                mainWindow.webContents.send('storage-folder-updated', selectedPath);
            } catch (error) {
                console.error('Failed to save settings:', error);
                dialog.showErrorBox('Settings Error', 'Failed to save the selected folder path.');
            }
        }
    });
}

// Continuous temperature monitoring (regardless of system state)
let temperatureMonitoringInterval = null;

function simulateNaturalCooling(currentTemp) {
    const roomTemp = 25; // Room temperature baseline
    
    if (currentTemp <= roomTemp) {
        // Already at or below room temperature, just add small variations
        const variation = Math.random() * 1 - 0.5; // -0.5 to 0.5 degree variation
        return Math.max(roomTemp - 2, Math.min(roomTemp + 2, currentTemp + variation));
    }
    
    // Calculate cooling rate based on temperature difference
    const tempDifference = currentTemp - roomTemp;
    
    // Natural cooling follows Newton's law of cooling (exponential decay)
    // Higher temperature differences cool faster
    let coolingRate;
    if (tempDifference > 100) {
        coolingRate = 2 + Math.random(); // Fast cooling for high temps
    } else if (tempDifference > 50) {
        coolingRate = 1 + Math.random() * 0.5; // Medium cooling
    } else if (tempDifference > 20) {
        coolingRate = 0.5 + Math.random() * 0.3; // Slow cooling
    } else {
        coolingRate = 0.2 + Math.random() * 0.1; // Very slow cooling near room temp
    }
    
    // Add some randomness to make it realistic
    const noise = (Math.random() - 0.5) * 0.3;
    
    return Math.max(roomTemp, currentTemp - coolingRate + noise);
}

// Legacy function for compatibility (now just starts continuous monitoring)
function startTemperatureControl() {
    // This function is now redundant as we use continuous monitoring
    // but keeping for backwards compatibility
    if (!temperatureMonitoringInterval) {
        startContinuousTemperatureMonitoring();
    }
}