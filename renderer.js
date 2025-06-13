// Renderer process
const { ipcRenderer } = require('electron');

// DOM Elements
const currentTempDisplay = document.getElementById('current-temp');
const tempSlider = document.getElementById('temp-slider');
const tempValue = document.getElementById('temp-value');
const heatingToggle = document.getElementById('heating-toggle');
const steamSlider = document.getElementById('steam-slider');
const steamValue = document.getElementById('steam-value');
const solenoidToggle = document.getElementById('solenoid-toggle');
const fanSlider = document.getElementById('fan-slider');
const fanValue = document.getElementById('fan-value');
const fanToggle = document.getElementById('fan-toggle');
const heatingStatus = document.getElementById('heating-status');
const fanStatus = document.getElementById('fan-status');
const steamStatus = document.getElementById('steam-status');
const heatingState = document.getElementById('heating-state');
const fanState = document.getElementById('fan-state');
const steamState = document.getElementById('steam-state');
const pressureValue = document.getElementById('pressure-value');
const pressureGauge = document.getElementById('pressure-gauge');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');

// Timer DOM elements
const timerDisplay = document.getElementById('timer-display');
const timerHours = document.getElementById('timer-hours');
const timerMinutes = document.getElementById('timer-minutes');
const timerSeconds = document.getElementById('timer-seconds');
const timerEnable = document.getElementById('timer-enable');
const timerControlGroup = document.querySelector('.timer-control-group');
const timerContent = document.getElementById('timer-content');
const timerSettings = document.getElementById('timer-settings');
const timerSetBtn = document.getElementById('timer-set-btn');
const timerCancelBtn = document.getElementById('timer-cancel-btn');

// New DOM elements for simulation and recording
const simulationIndicator = document.getElementById('simulation-indicator');
const recordingInterval = document.getElementById('recording-interval');
const recordingStatusText = document.getElementById('recording-status-text');
const storageFolderBtn = document.getElementById('storage-folder-btn');

// Preset Management DOM Elements
const presetsContainer = document.getElementById('presets-container');
const savePresetBtn = document.getElementById('save-preset-btn');
const contextMenu = document.getElementById('context-menu');
const editPresetOption = document.getElementById('edit-preset');
const deletePresetOption = document.getElementById('delete-preset');
const presetModal = document.getElementById('preset-modal');

// Settings Menu DOM Elements
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const modalTitle = document.getElementById('modal-title');
const presetNameInput = document.getElementById('preset-name');
const presetDescriptionInput = document.getElementById('preset-description');
const cancelPresetBtn = document.getElementById('cancel-preset');
const confirmPresetBtn = document.getElementById('confirm-preset');
const closeModalBtn = document.querySelector('.close-modal');
const modalDeleteBtn = document.getElementById('modal-delete-preset');

// Chart initialization - Custom implementation for ARM compatibility
const tempChartCanvas = document.getElementById('temp-chart');
const tempChart = new TemperatureChart(tempChartCanvas, {
    maxDataPoints: 30,
    minValue: 20,
    maxValue: 320,
    gridColor: '#e0e0e0',           // Light gray grid
    lineColor: '#1976d2',           // Blue line
    fillColor: 'rgba(25, 118, 210, 0.08)', // Soft blue fill
    backgroundColor: '#fafbfc',     // Very light background
    textColor: '#333333'            // Dark gray text
});

// System state
let systemRunning = false;
let currentTemp = 25;
let targetTemp = 150;
let fanSpeed = 0;
let steamLevel = 0;
let pressureLevel = 0;
let isRecording = true; // Default to true as we start recording on app launch

// Timer state
let timerEnabled = false; // Start disabled
let timerActive = false;
let timerRemainingSeconds = 0;
let timerTotalSeconds = 0;
let timerInterval = null;

// Temperature unit toggle
let isFahrenheit = false;
const tempDisplayContainer = document.getElementById('temp-display-container');
const tempUnit = document.getElementById('temp-unit');

// Initialize temperature unit from localStorage
const savedTempUnit = localStorage.getItem('temperatureUnit');
if (savedTempUnit === 'fahrenheit') {
    isFahrenheit = true;
}

// Initialize temperature display with proper unit
updateTemperatureDisplay(currentTemp);

// Temperature conversion functions
function celsiusToFahrenheit(celsius) {
    return (celsius * 9/5) + 32;
}

function fahrenheitToCelsius(fahrenheit) {
    return (fahrenheit - 32) * 5/9;
}

function updateTemperatureDisplay(tempCelsius) {
    if (isFahrenheit) {
        const tempF = celsiusToFahrenheit(tempCelsius);
        currentTempDisplay.textContent = Math.round(tempF);
        tempUnit.textContent = '°F';
    } else {
        currentTempDisplay.textContent = Math.round(tempCelsius);
        tempUnit.textContent = '°C';
    }
}

function toggleTemperatureUnit() {
    isFahrenheit = !isFahrenheit;
    updateTemperatureDisplay(currentTemp);
    
    // Update temperature setpoint display
    updateTemperatureSetpointDisplay();
    
    // Update chart display
    tempChart.setTemperatureUnit(isFahrenheit);
    
    // Update editable temperature range with new unit
    updateEditableTemperatureRange();
    
    // Save preference to localStorage
    localStorage.setItem('temperatureUnit', isFahrenheit ? 'fahrenheit' : 'celsius');
}

// Helper function to update temperature setpoint display when unit changes
function updateTemperatureSetpointDisplay() {
    if (isFahrenheit) {
        const tempF = celsiusToFahrenheit(targetTemp);
        tempValue.textContent = `${Math.round(tempF)}°F`;
    } else {
        tempValue.textContent = `${targetTemp}°C`;
    }
}

// Helper function to update editable temperature range units
function updateEditableTemperatureRange() {
    // Update the makeRangeValueEditable for temperature with new unit
    // We need to recreate the editable functionality with updated units
    const newUnit = isFahrenheit ? '°F' : '°C';
    
    // Update the display with new unit
    if (isFahrenheit) {
        const tempF = celsiusToFahrenheit(targetTemp);
        tempValue.textContent = `${Math.round(tempF)}°F`;
    } else {
        tempValue.textContent = `${targetTemp}°C`;
    }
}

// Initialize presets and their order
function initializePresets() {
    // Try to load presets from localStorage
    const savedPresets = localStorage.getItem('ovenPresets');
    const savedOrder = localStorage.getItem('ovenPresetsOrder');
    
    if (savedPresets) {
        presets = JSON.parse(savedPresets);
    } else {        // Default presets
        presets = {
            chicken: {
                name: 'Chicken',
                description: 'For cooking chicken',
                temp: 180,
                fan: 40,
                steam: false,
                timer: {
                    enabled: true,
                    hours: 1,
                    minutes: 30,
                    seconds: 0,
                    totalSeconds: 5400
                }
            },
            beef: {
                name: 'Beef',
                description: 'For cooking beef', 
                temp: 200,
                fan: 60,
                steam: false,
                timer: {
                    enabled: true,
                    hours: 2,
                    minutes: 0,
                    seconds: 0,
                    totalSeconds: 7200
                }
            },
            apple: {
                name: 'Apple',
                description: 'For drying apple slices',
                temp: 75,
                fan: 100,
                steam: false,
                timer: {
                    enabled: true,
                    hours: 8,
                    minutes: 0,
                    seconds: 0,
                    totalSeconds: 28800
                }
            }
        };
    }
    
    // Load or initialize the order
    if (savedOrder) {
        presetOrder = JSON.parse(savedOrder);
        
        // Add any new presets that might not be in the order
        Object.keys(presets).forEach(id => {
            if (!presetOrder.includes(id)) {
                presetOrder.push(id);
            }
        });
        
        // Remove any presets from order that no longer exist
        presetOrder = presetOrder.filter(id => presets[id]);
    } else {
        // Default order is just the keys
        presetOrder = Object.keys(presets);
    }
}

// Initialize presets when the app starts
initializePresets();

// Save presets to localStorage
function savePresetsToStorage() {
    localStorage.setItem('ovenPresets', JSON.stringify(presets));
    localStorage.setItem('ovenPresetsOrder', JSON.stringify(presetOrder));
}

// Generate a unique ID for new presets
function generatePresetId(name) {
    const baseId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let id = baseId;
    let counter = 1;
    
    while (presets[id]) {
        id = `${baseId}-${counter}`;
        counter++;
    }
    
    return id;
}

// Render all presets to the UI
function renderPresets() {
    presetsContainer.innerHTML = '';
    
    presetOrder.forEach(id => {
        const preset = presets[id];
        const presetBtn = document.createElement('button');
        presetBtn.className = 'button';
        presetBtn.dataset.presetId = id;
          // Create timer display string
        let timerDisplay = '';
        if (preset.timer && preset.timer.enabled) {
            const hours = preset.timer.hours || 0;
            const minutes = preset.timer.minutes || 0;
            const seconds = preset.timer.seconds || 0;
            timerDisplay = `<span class="timer-info">⏱️${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</span>`;
        }
        
        presetBtn.innerHTML = `${preset.name}<span class="preset-desc">(${preset.description || ''}${timerDisplay})</span>`;
        
        // Touch and click tracking variables for this specific button
        let touchTimer = null;
        let touchStart = null;
        let hasMoved = false;
        let isLongPress = false;
        
        // Add event listeners
        presetBtn.addEventListener('click', (e) => {
            // Prevent click if it was a long press
            if (!isLongPress) {
                applyPreset(id);
            }
            isLongPress = false; // Reset for next interaction
        });
        
        // Right-click context menu (desktop)
        presetBtn.addEventListener('contextmenu', (e) => showContextMenu(e, id, presetBtn));
        
        // Double-click for editing (desktop)
        presetBtn.addEventListener('dblclick', (e) => {
            e.preventDefault(); // Prevent any other actions
            showEditPresetModal(id);
        });
        
        // Touch events for mobile/tablet support
        presetBtn.addEventListener('touchstart', (e) => {
            touchStart = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                time: Date.now()
            };
            hasMoved = false;
            isLongPress = false;
            
            // Start long press timer
            touchTimer = setTimeout(() => {
                if (!hasMoved && touchStart) {
                    isLongPress = true;
                    // Trigger haptic feedback if available
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                    // Create a fake right-click event for the context menu
                    const contextEvent = new MouseEvent('contextmenu', {
                        bubbles: true,
                        cancelable: true,
                        clientX: touchStart.x,
                        clientY: touchStart.y
                    });
                    showContextMenu(contextEvent, id, presetBtn);
                }
            }, 500); // 500ms long press
        });
        
        presetBtn.addEventListener('touchmove', (e) => {
            if (touchStart) {
                const deltaX = Math.abs(e.touches[0].clientX - touchStart.x);
                const deltaY = Math.abs(e.touches[0].clientY - touchStart.y);
                
                // If finger moved more than 10px, cancel long press
                if (deltaX > 10 || deltaY > 10) {
                    hasMoved = true;
                    if (touchTimer) {
                        clearTimeout(touchTimer);
                        touchTimer = null;
                    }
                }
            }
        });
        
        presetBtn.addEventListener('touchend', (e) => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
            
            // Handle double-tap for editing (touch equivalent of double-click)
            if (!hasMoved && !isLongPress && touchStart) {
                const timeSinceStart = Date.now() - touchStart.time;
                
                // Check for quick double-tap (within 300ms of each other)
                if (timeSinceStart < 300 && presetBtn.lastTapTime && 
                    (Date.now() - presetBtn.lastTapTime) < 300) {
                    e.preventDefault();
                    showEditPresetModal(id);
                    presetBtn.lastTapTime = null; // Reset to prevent triple-tap issues
                    return;
                }
                
                presetBtn.lastTapTime = Date.now();
            }
            
            touchStart = null;
        });
        
        presetBtn.addEventListener('touchcancel', () => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
            touchStart = null;
            hasMoved = false;
            isLongPress = false;
        });
        
        // Add drag-and-drop event listeners
        presetBtn.setAttribute('draggable', 'true');
        presetBtn.addEventListener('dragstart', handleDragStart);
        presetBtn.addEventListener('dragend', handleDragEnd);
        presetBtn.addEventListener('dragover', handleDragOver);
        presetBtn.addEventListener('dragenter', handleDragEnter);
        presetBtn.addEventListener('dragleave', handleDragLeave);
        presetBtn.addEventListener('drop', handleDrop);
        
        // Touch-based drag and drop alternative using long press
        addTouchDragAndDrop(presetBtn, id);
        
        presetsContainer.appendChild(presetBtn);
    });
}

// Show the context menu for preset options
function showContextMenu(e, presetId, element) {
    e.preventDefault();
    
    // Save the selected preset ID and element
    selectedPresetElement = element;
    currentEditingPresetId = presetId;
    
    // Position the context menu with viewport bounds checking
    let x = e.clientX;
    let y = e.clientY;
    
    // Show the menu temporarily to get its dimensions
    contextMenu.style.visibility = 'hidden';
    contextMenu.style.display = 'block';
    const menuRect = contextMenu.getBoundingClientRect();
    contextMenu.style.display = 'none';
    contextMenu.style.visibility = 'visible';
    
    // Check if menu would go off the right edge of the screen
    if (x + menuRect.width > window.innerWidth) {
        x = window.innerWidth - menuRect.width - 10;
    }
    
    // Check if menu would go off the bottom edge of the screen
    if (y + menuRect.height > window.innerHeight) {
        y = window.innerHeight - menuRect.height - 10;
    }
    
    // Ensure menu doesn't go off the left or top edges
    x = Math.max(10, x);
    y = Math.max(10, y);
    
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';
    
    // Add visual feedback for touch devices
    if (element && 'ontouchstart' in window) {
        element.classList.add('long-press-active');
        setTimeout(() => {
            element.classList.remove('long-press-active');
        }, 200);
    }
    
    // Add global click event to close the menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu);
        document.addEventListener('touchstart', hideContextMenu);
    }, 0);
}

// Hide the context menu
function hideContextMenu() {
    contextMenu.style.display = 'none';
    document.removeEventListener('click', hideContextMenu);
    document.removeEventListener('touchstart', hideContextMenu);
}

// Show the modal for creating a new preset
function showCreatePresetModal() {
    modalTitle.textContent = 'Save as Preset';
    presetNameInput.value = '';
    presetDescriptionInput.value = '';
    currentEditingPresetId = null;
    
    // Hide delete button for new presets
    modalDeleteBtn.style.display = 'none';
    
    // Display the modal
    presetModal.style.display = 'flex';
}

// Show the modal for editing an existing preset
function showEditPresetModal(presetId) {
    const preset = presets[presetId];
    if (!preset) return;
    
    modalTitle.textContent = 'Edit Preset';
    presetNameInput.value = preset.name;
    presetDescriptionInput.value = preset.description || '';
    currentEditingPresetId = presetId;
    
    // Show delete button for existing presets
    modalDeleteBtn.style.display = 'block';
    
    // Display the modal
    presetModal.style.display = 'flex';
}

// Close the preset modal
function hidePresetModal() {
    presetModal.style.display = 'none';
    presetNameInput.value = '';
    presetDescriptionInput.value = '';
    
    // Hide delete button when closing modal
    modalDeleteBtn.style.display = 'none';
    
    // Clear the current editing preset ID
    currentEditingPresetId = null;
}

// Save the current settings as a new preset
function createPreset() {
    const name = presetNameInput.value.trim();
    const description = presetDescriptionInput.value.trim();
    
    if (!name) {
        alert('Please enter a name for the preset');
        return;
    }
    
    // Get current timer settings
    const currentTimerHours = parseInt(timerHours.value) || 0;
    const currentTimerMinutes = parseInt(timerMinutes.value) || 0;
    const currentTimerSeconds = parseInt(timerSeconds.value) || 0;
    const currentTimerTotal = currentTimerHours * 3600 + currentTimerMinutes * 60 + currentTimerSeconds;
    
    // Create preset object with current settings - save slider values regardless of toggle state
    const preset = {
        name: name,
        description: description,
        temp: parseInt(tempSlider.value),
        fan: parseInt(fanSlider.value),     // Always save the fan slider value regardless of toggle state
        steam: parseInt(steamSlider.value), // Save steam slider value instead of toggle state
        timer: {
            enabled: timerEnabled,
            hours: currentTimerHours,
            minutes: currentTimerMinutes,
            seconds: currentTimerSeconds,
            totalSeconds: currentTimerTotal
        }
    };
    
    // If editing, update the existing preset
    if (currentEditingPresetId && presets[currentEditingPresetId]) {
        presets[currentEditingPresetId] = preset;
    } else {
        // Otherwise create a new preset
        const id = generatePresetId(name);
        presets[id] = preset;
        presetOrder.push(id);
    }
    
    // Save and update UI
    savePresetsToStorage();
    renderPresets();
    hidePresetModal();
}

// Delete a preset
function deletePreset(presetId) {
    delete presets[presetId];
    presetOrder = presetOrder.filter(id => id !== presetId);
    savePresetsToStorage();
    renderPresets();
}

// Apply a preset configuration
function applyPreset(presetName) {
    const preset = presets[presetName];
    if (!preset) return;
    
    // Set temperature
    tempSlider.value = preset.temp;
    targetTemp = preset.temp;
    tempValue.textContent = `${targetTemp}°C`;
    
    // Set steam - always turn off toggle but set slider value
    solenoidToggle.checked = false;
    steamSlider.value = preset.steam || 0;
    steamLevel = preset.steam || 0;
    steamValue.textContent = `${steamLevel}%`;
    // No longer disabling the slider when applying presets
    
    // Set fan - preserve toggle state but set slider value
    // Note: We're not changing fanToggle.checked here, keeping it in its current state
    fanSlider.value = preset.fan || 0;
    fanSpeed = preset.fan || 0;
    fanValue.textContent = `${fanSpeed}%`;
    
    // Apply timer settings if they exist
    if (preset.timer) {
        // Set timer enabled state
        timerEnable.checked = preset.timer.enabled || false;
        timerEnabled = preset.timer.enabled || false;
        
        // Set timer values
        timerHours.value = preset.timer.hours || 0;
        timerMinutes.value = preset.timer.minutes || 0;
        timerSeconds.value = preset.timer.seconds || 0;
        
        // Update timer total seconds for internal tracking
        timerTotalSeconds = preset.timer.totalSeconds || 0;
        
        // Apply timer enable state and update display
        toggleTimerEnable();
        updateTimerDisplay();
    } else {
        // If no timer data in preset, disable timer
        timerEnable.checked = false;
        timerEnabled = false;
        timerHours.value = 0;
        timerMinutes.value = 0;
        timerSeconds.value = 0;
        timerTotalSeconds = 0;
        toggleTimerEnable();
        updateTimerDisplay();
    }
    
    // Update status indicators - only heating should be true, fan keeps its state
    updateHeatingStatus(true);
    // Do not change fan status - it stays in its current state
    updateSteamStatus(false); // Steam always off when loading preset
    
    // Send values to main process
    ipcRenderer.send('set-temperature', targetTemp);
    ipcRenderer.send('set-heating', true);
    ipcRenderer.send('set-fan', fanToggle.checked ? fanSpeed : 0); // Send fan speed only if toggle is on
    ipcRenderer.send('set-solenoid', false); // Steam always off
    ipcRenderer.send('set-steam-level', 0); // Steam level 0 since toggle is off
}

// Event listeners for controls
tempSlider.addEventListener('input', () => {
    // Slider always works in Celsius internally
    targetTemp = parseInt(tempSlider.value);
    
    // Update display based on current unit
    updateTemperatureSetpointDisplay();
    
    ipcRenderer.send('set-temperature', targetTemp);
});

heatingToggle.addEventListener('change', () => {
    const isOn = heatingToggle.checked;
    updateHeatingStatus(isOn);
    ipcRenderer.send('set-heating', isOn);
});

solenoidToggle.addEventListener('change', () => {
    const isOn = solenoidToggle.checked;
    updateSteamStatus(isOn);
    ipcRenderer.send('set-solenoid', isOn);
    
    // No longer disabling the slider, just control whether to send the value
    if (isOn) {
        // Keep existing steam level value
        ipcRenderer.send('set-steam-level', steamLevel);
    } else {
        // Don't send steam when off, but preserve the slider value
        ipcRenderer.send('set-steam-level', 0);
    }
});

steamSlider.addEventListener('input', () => {
    steamLevel = parseInt(steamSlider.value);
    steamValue.textContent = `${steamLevel}%`;
    
    // Only send steam level to main process if the toggle is on
    if (solenoidToggle.checked) {
        ipcRenderer.send('set-steam-level', steamLevel);
    }
});

fanToggle.addEventListener('change', () => {
    const isOn = fanToggle.checked;
    updateFanStatus(isOn);
    
    // Remove the code that resets the slider value to 0
    // Keep the current slider position even when toggled off
    
    ipcRenderer.send('set-fan', isOn ? fanSpeed : 0);
});

fanSlider.addEventListener('input', () => {
    fanSpeed = parseInt(fanSlider.value);
    fanValue.textContent = `${fanSpeed}%`;
    
    if (fanToggle.checked) {
        ipcRenderer.send('set-fan', fanSpeed);
    }
});

// Start and stop buttons
startBtn.addEventListener('click', startSystem);
stopBtn.addEventListener('click', stopSystem);

// Timer event listeners
timerEnable.addEventListener('change', toggleTimerEnable);

// Timer display click to show settings
timerDisplay.addEventListener('click', showTimerSettings);

// Timer input event listeners
timerHours.addEventListener('input', () => {
    // Ensure hours stay within 0-23 range
    let value = parseInt(timerHours.value) || 0;
    if (value > 23) {
        timerHours.value = 23;
    } else if (value < 0) {
        timerHours.value = 0;
    }
});

// Prevent event bubbling for timer inputs
timerHours.addEventListener('click', (e) => e.stopPropagation());
timerHours.addEventListener('focus', (e) => e.stopPropagation());
timerHours.addEventListener('touchstart', (e) => e.stopPropagation());

timerMinutes.addEventListener('input', () => {
    // Ensure minutes stay within 0-59 range
    let value = parseInt(timerMinutes.value) || 0;
    if (value > 59) {
        timerMinutes.value = 59;
    } else if (value < 0) {
        timerMinutes.value = 0;
    }
});

// Prevent event bubbling for timer inputs
timerMinutes.addEventListener('click', (e) => e.stopPropagation());
timerMinutes.addEventListener('focus', (e) => e.stopPropagation());
timerMinutes.addEventListener('touchstart', (e) => e.stopPropagation());

timerSeconds.addEventListener('input', () => {
    // Ensure seconds stay within 0-59 range
    let value = parseInt(timerSeconds.value) || 0;
    if (value > 59) {
        timerSeconds.value = 59;
    } else if (value < 0) {
        timerSeconds.value = 0;
    }
});

// Prevent event bubbling for timer inputs
timerSeconds.addEventListener('click', (e) => e.stopPropagation());
timerSeconds.addEventListener('focus', (e) => e.stopPropagation());
timerSeconds.addEventListener('touchstart', (e) => e.stopPropagation());

// Timer settings buttons
timerSetBtn.addEventListener('click', setTimerValues);
timerCancelBtn.addEventListener('click', hideTimerSettings);

// Event listeners for preset management
savePresetBtn.addEventListener('click', showCreatePresetModal);

editPresetOption.addEventListener('click', () => {
    showEditPresetModal(currentEditingPresetId);
});

deletePresetOption.addEventListener('click', () => {
    deletePreset(currentEditingPresetId);
});

confirmPresetBtn.addEventListener('click', createPreset);
cancelPresetBtn.addEventListener('click', hidePresetModal);
closeModalBtn.addEventListener('click', hidePresetModal);

// Prevent event bubbling for modal input fields
presetNameInput.addEventListener('click', (e) => e.stopPropagation());
presetNameInput.addEventListener('focus', (e) => e.stopPropagation());
presetNameInput.addEventListener('touchstart', (e) => e.stopPropagation());

presetDescriptionInput.addEventListener('click', (e) => e.stopPropagation());
presetDescriptionInput.addEventListener('focus', (e) => e.stopPropagation());
presetDescriptionInput.addEventListener('touchstart', (e) => e.stopPropagation());

// Also protect the recording interval input
recordingInterval.addEventListener('click', (e) => e.stopPropagation());
recordingInterval.addEventListener('focus', (e) => e.stopPropagation());
recordingInterval.addEventListener('touchstart', (e) => e.stopPropagation());

// Storage folder selection button
storageFolderBtn.addEventListener('click', () => {
    ipcRenderer.send('select-storage-folder');
});

// Listen for storage folder updates
ipcRenderer.on('storage-folder-updated', (event, folderPath) => {
    // Optional: Update UI to show selected folder
    storageFolderBtn.title = `CSV files saved to: ${folderPath}`;
});

// Add event listener for modal delete button
modalDeleteBtn.addEventListener('click', () => {
    if (currentEditingPresetId) {
        // Add confirmation for touch devices
        const isTouch = 'ontouchstart' in window;
        const confirmMessage = `Are you sure you want to delete "${presets[currentEditingPresetId]?.name || 'this preset'}"?`;
        
        if (isTouch) {
            // Use a more touch-friendly confirmation
            if (confirm(confirmMessage)) {
                deletePreset(currentEditingPresetId);
                hidePresetModal();
            }
        } else {
            // Standard confirmation for desktop
            if (confirm(confirmMessage)) {
                deletePreset(currentEditingPresetId);
                hidePresetModal();
            }
        }
    }
});

// Timer Functions
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    // Always show HH:MM:SS format
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
    if (timerActive) {
        timerDisplay.textContent = formatTime(timerRemainingSeconds);
        
        // Update visual state based on remaining time
        timerDisplay.classList.remove('running', 'warning', 'critical');
        
        if (timerRemainingSeconds > 60) {
            timerDisplay.classList.add('running');
        } else if (timerRemainingSeconds > 10) {
            timerDisplay.classList.add('warning');
        } else {
            timerDisplay.classList.add('critical');
        }
    } else {
        const inputHours = parseInt(timerHours.value) || 0;
        const inputMinutes = parseInt(timerMinutes.value) || 0;
        const inputSeconds = parseInt(timerSeconds.value) || 0;
        const totalSeconds = inputHours * 3600 + inputMinutes * 60 + inputSeconds;
        timerDisplay.textContent = formatTime(totalSeconds);
        timerDisplay.classList.remove('running', 'warning', 'critical');
    }
}

function showTimerSettings() {
    if (!timerEnabled || timerActive) return;
    
    // Populate inputs with current display values
    const currentText = timerDisplay.textContent;
    const parts = currentText.split(':');
    
    if (parts.length === 3) {
        // HH:MM:SS format
        timerHours.value = parseInt(parts[0]) || 0;
        timerMinutes.value = parseInt(parts[1]) || 0;
        timerSeconds.value = parseInt(parts[2]) || 0;
    } else if (parts.length === 2) {
        // MM:SS format
        timerHours.value = 0;
        timerMinutes.value = parseInt(parts[0]) || 0;
        timerSeconds.value = parseInt(parts[1]) || 0;
    }
    
    timerSettings.style.display = 'block';
}

function hideTimerSettings() {
    timerSettings.style.display = 'none';
}

function setTimerValues() {
    // Validate and normalize input values
    let hours = Math.max(0, Math.min(23, parseInt(timerHours.value) || 0));
    let minutes = Math.max(0, Math.min(59, parseInt(timerMinutes.value) || 0));
    let seconds = Math.max(0, Math.min(59, parseInt(timerSeconds.value) || 0));
    
    // Update input fields with normalized values
    timerHours.value = hours;
    timerMinutes.value = minutes;
    timerSeconds.value = seconds;
    
    // Calculate total seconds for the timer
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    timerTotalSeconds = totalSeconds;
    
    // Send timer state to main process for CSV logging
    ipcRenderer.send('timer-state', {
        enabled: timerEnabled,
        active: timerActive,
        remaining: timerRemainingSeconds,
        total: timerTotalSeconds
    });
    
    updateTimerDisplay();
    hideTimerSettings();
}

function startTimer() {
    if (!timerEnabled) return;
    
    const inputHours = parseInt(timerHours.value) || 0;
    const inputMinutes = parseInt(timerMinutes.value) || 0;
    const inputSeconds = parseInt(timerSeconds.value) || 0;
    timerTotalSeconds = inputHours * 3600 + inputMinutes * 60 + inputSeconds;
    
    if (timerTotalSeconds <= 0) return;
    
    timerRemainingSeconds = timerTotalSeconds;
    timerActive = true;
    
    // Send timer state to main process for CSV logging
    ipcRenderer.send('timer-state', {
        enabled: timerEnabled,
        active: timerActive,
        remaining: timerRemainingSeconds,
        total: timerTotalSeconds
    });
    
    timerInterval = setInterval(() => {
        timerRemainingSeconds--;
        updateTimerDisplay();
        
        // Send updated timer state every second
        ipcRenderer.send('timer-state', {
            enabled: timerEnabled,
            active: timerActive,
            remaining: timerRemainingSeconds,
            total: timerTotalSeconds
        });
        
        if (timerRemainingSeconds <= 0) {
            stopTimer();
            stopSystem(); // Automatically stop the oven when timer runs out
        }
    }, 1000);
    
    updateTimerDisplay();
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerActive = false;
    timerRemainingSeconds = 0;
    
    // Send timer state to main process for CSV logging
    ipcRenderer.send('timer-state', {
        enabled: timerEnabled,
        active: timerActive,
        remaining: timerRemainingSeconds,
        total: timerTotalSeconds
    });
    
    updateTimerDisplay();
}

function toggleTimerEnable() {
    timerEnabled = timerEnable.checked;
    
    if (timerEnabled) {
        // Show timer content with sliding animation
        timerContent.classList.add('enabled');
        timerHours.disabled = false;
        timerMinutes.disabled = false;
        timerSeconds.disabled = false;
    } else {
        // Hide timer content with sliding animation
        timerContent.classList.remove('enabled');
        timerHours.disabled = true;
        timerMinutes.disabled = true;
        timerSeconds.disabled = true;
        hideTimerSettings();
        if (timerActive) {
            stopTimer();
        }
    }
    
    // Send timer state to main process for CSV logging
    ipcRenderer.send('timer-state', {
        enabled: timerEnabled,
        active: timerActive,
        remaining: timerRemainingSeconds,
        total: timerTotalSeconds
    });
    
    updateTimerDisplay();
}

// Start the system
function startSystem() {
    // Check if timer is enabled and has valid values
    if (timerEnabled) {
        const inputHours = parseInt(timerHours.value) || 0;
        const inputMinutes = parseInt(timerMinutes.value) || 0;
        const inputSeconds = parseInt(timerSeconds.value) || 0;
        const totalSeconds = inputHours * 3600 + inputMinutes * 60 + inputSeconds;
        
        if (totalSeconds <= 0) {
            alert('Please set a valid timer duration before starting the system.');
            return;
        }
    }
    
    systemRunning = true;
    
    // Always turn on heating
    heatingToggle.checked = true;
    updateHeatingStatus(true);
    
    // Turn on fan toggle if slider value is not zero
    const fanValue = parseInt(fanSlider.value);
    if (fanValue > 0) {
        fanToggle.checked = true;
        updateFanStatus(true);
        ipcRenderer.send('set-fan', fanValue);
    }
    
    // Turn on solenoid toggle if steam slider value is not zero
    const steamValue = parseInt(steamSlider.value);
    if (steamValue > 0) {
        solenoidToggle.checked = true;
        updateSteamStatus(true);
        ipcRenderer.send('set-solenoid', true);
        ipcRenderer.send('set-steam-level', steamValue);
    }
    
    // Explicitly set heating elements on
    ipcRenderer.send('set-heating', true);
    
    // Start timer if enabled
    if (timerEnabled) {
        startTimer();
    }
    
    ipcRenderer.send('start-system');
    
    // Temperature and pressure monitoring is handled by the main process
    // No local simulation needed
}

// Stop the system - temperature monitoring continues in main process
function stopSystem() {
    systemRunning = false;
    heatingToggle.checked = false;
    fanToggle.checked = false;
    solenoidToggle.checked = false;
    
    updateHeatingStatus(false);
    updateFanStatus(false);
    updateSteamStatus(false);
    
    // Stop timer
    stopTimer();
    
    // Send stop command - main process will handle cooling simulation
    ipcRenderer.send('stop-system');
    
    // Stop any remaining local simulation intervals
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    
    // Temperature monitoring and cooling simulation continues in the main process
}

// Update status indicators
function updateHeatingStatus(isOn) {
    heatingStatus.className = `status-indicator ${isOn ? 'active' : 'inactive'}`;
    heatingState.textContent = isOn ? 'ON' : 'OFF';
}

function updateFanStatus(isOn) {
    fanStatus.className = `status-indicator ${isOn ? 'active' : 'inactive'}`;
    fanState.textContent = isOn ? 'ON' : 'OFF';
}

function updateSteamStatus(isOn) {
    steamStatus.className = `status-indicator ${isOn ? 'active' : 'inactive'}`;
    steamState.textContent = isOn ? 'ON' : 'OFF';
}

// Simulation variables (legacy - now handled by main process)
let simulationInterval;

// Legacy simulation functions - no longer used as main process handles all monitoring
// Keeping for compatibility but they should not be called

function startSimulation() {
    // No longer used - main process handles temperature simulation
    console.log('startSimulation called but main process now handles temperature monitoring');
}

function stopSimulation() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
}

function startCoolingSimulation() {
    // No longer used - main process handles cooling simulation
    console.log('startCoolingSimulation called but main process now handles cooling');
}

// Handle temperature updates from main process
ipcRenderer.on('temperature-reading', (event, temp) => {
    currentTemp = temp;
    updateTemperatureDisplay(currentTemp);
    
    // Always update chart, regardless of system state
    tempChart.addDataPoint(currentTemp);
});

// Handle pressure updates from main process
ipcRenderer.on('pressure-reading', (event, pressure) => {
    pressureLevel = pressure;
    const pressurePct = (pressureLevel / 3) * 100;
    pressureGauge.style.width = `${pressurePct}%`;
    pressureValue.textContent = `${pressureLevel.toFixed(2)} V`;
});

// Update recording status display
function updateRecordingStatus(isActive) {
    isRecording = isActive;
    recordingStatusText.textContent = isActive ? 'Recording data...' : 'Not recording';
}

// When the page loads, set up recording interval change handler
recordingInterval.addEventListener('change', () => {
    const interval = parseInt(recordingInterval.value) || 5;
    if (interval < 1) recordingInterval.value = 1;
    
    // Send new interval to main process
    ipcRenderer.send('set-recording-interval', interval);
});

// Listen for simulation mode status from main process
ipcRenderer.on('simulation-mode', (event, isSimulation) => {
    if (isSimulation) {
        simulationIndicator.style.display = 'block';
    } else {
        simulationIndicator.style.display = 'none';
    }
});

// Listen for recording status updates
ipcRenderer.on('recording-data', (event, data) => {
    updateRecordingStatus(true);
    // Could display last recorded data point if needed
});

// Listen for recording interval updates
ipcRenderer.on('recording-interval-updated', (event, interval) => {
    recordingInterval.value = interval;
});

// Theme Management
const themes = ['default', 'dark-theme', 'msu-theme'];
let currentThemeIndex = 0;

// Load saved theme on startup
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('selected-theme');
    if (savedTheme && themes.includes(savedTheme)) {
        const themeIndex = themes.indexOf(savedTheme);
        currentThemeIndex = themeIndex;
        applyTheme(savedTheme);
    }
}

// Apply theme to body
function applyTheme(theme) {
    // Remove all theme classes
    document.body.classList.remove(...themes.slice(1)); // Skip 'default'
    
    // Add new theme class (if not default)
    if (theme !== 'default') {
        document.body.classList.add(theme);
    }
    
    // Update button text based on current theme
    updateThemeButtonText();
    
    // Save theme preference
    localStorage.setItem('selected-theme', theme);
}

// Update theme button text
function updateThemeButtonText() {
    const currentTheme = themes[currentThemeIndex];
    switch (currentTheme) {
        case 'default':
            themeToggleBtn.textContent = 'Light';
            break;
        case 'dark-theme':
            themeToggleBtn.textContent = 'Dark';
            break;
        case 'msu-theme':
            themeToggleBtn.textContent = 'MSU';
            break;
    }
}

// Theme toggle functionality
function toggleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const newTheme = themes[currentThemeIndex];
    applyTheme(newTheme);
}

// Event listener for theme toggle button
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    loadSavedTheme();
});

// Also call loadSavedTheme immediately in case DOMContentLoaded already fired
loadSavedTheme();

// Initialize the application
function init() {
    renderPresets();    // Initialize timer
    timerEnable.checked = false; // Start unchecked
    toggleTimerEnable();
    updateTimerDisplay();
    
    // Set initial timer values to 00:00:00
    timerHours.value = 0;
    timerMinutes.value = 0;
    timerSeconds.value = 0;
    
    // Detect touch capability and show/hide instructions
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const touchInstructions = document.getElementById('touch-instructions');
    
    if (isTouchDevice && touchInstructions) {
        // Show instructions for 5 seconds, then fade out
        setTimeout(() => {
            touchInstructions.style.transition = 'opacity 1s ease-out';
            touchInstructions.style.opacity = '0';
            setTimeout(() => {
                touchInstructions.style.display = 'none';
            }, 1000);
        }, 5000);
    }
      // Add event listener to document to handle clicks outside context menu
    document.addEventListener('click', (e) => {
        // Don't interfere with input fields
        if (e.target.tagName === 'INPUT' || e.target.closest('.timer-settings') || e.target.closest('.modal-content')) {
            return;
        }
        
        if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    // Add touch event listener for context menu hiding
    document.addEventListener('touchstart', (e) => {
        // Don't interfere with input fields
        if (e.target.tagName === 'INPUT' || e.target.closest('.timer-settings') || e.target.closest('.modal-content')) {
            return;
        }
        
        if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    // Add escape key listener to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (presetModal.style.display === 'flex') {
                hidePresetModal();
            }
            if (contextMenu.style.display === 'block') {
                hideContextMenu();
            }
        }
    });
}

// Initialize app on load
document.addEventListener('DOMContentLoaded', init);

// Drag start event - when user starts dragging a preset
function handleDragStart(e) {
    this.classList.add('dragging');
    draggingElement = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.presetId);
    
    // Create a drag image
    const dragImage = this.cloneNode(true);
    dragImage.style.opacity = '0.7';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-9999px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 10, 10);
    
    // Remove the cloned element after a short delay
    setTimeout(() => {
        document.body.removeChild(dragImage);
    }, 0);
}

// Drag end event - when user releases the dragged preset
function handleDragEnd() {
    this.classList.remove('dragging');
    
    // Reset all preset buttons
    const presetButtons = document.querySelectorAll('.button[data-preset-id]');
    presetButtons.forEach(btn => {
        btn.classList.remove('dragging');
        btn.classList.remove('over');
    });
    
    draggingElement = null;
}

// Drag over event - when dragged preset is over another preset
function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault(); // Necessary to allow dropping
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

// Drag enter event - when dragged preset enters another preset
function handleDragEnter() {
    this.classList.add('over');
}

// Drag leave event - when dragged preset leaves another preset
function handleDragLeave() {
    this.classList.remove('over');
}

// Drop event - when dragged preset is released over another preset
function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation(); // Stops the browser from redirecting
    }
    
    if (draggingElement !== this) {
        // Get the IDs of the dragged preset and the target preset
        const draggedId = draggingElement.dataset.presetId;
        const targetId = this.dataset.presetId;
        
        // Find their positions in the order array
        const draggedIndex = presetOrder.indexOf(draggedId);
        const targetIndex = presetOrder.indexOf(targetId);
        
        // Remove the dragged ID from the order
        presetOrder.splice(draggedIndex, 1);
        
        // Insert the dragged ID at the target position
        presetOrder.splice(targetIndex, 0, draggedId);
        
        // Save the new order and re-render
        savePresetsToStorage();
        renderPresets();
    }
    
    this.classList.remove('over');
    return false;
}

// Temperature display click handler for unit toggle
tempDisplayContainer.addEventListener('click', toggleTemperatureUnit);

// Make range values editable
function makeRangeValueEditable(element, slider, min, max, unit = '', isTemperature = false) {
    element.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        if (element.classList.contains('editing')) {
            return;
        }
        
        let currentValue, displayMin, displayMax, displayUnit;
        
        if (isTemperature) {
            // For temperature, handle unit conversion
            currentValue = parseInt(slider.value); // Slider value is always in Celsius
            if (isFahrenheit) {
                displayMin = Math.round(celsiusToFahrenheit(min));
                displayMax = Math.round(celsiusToFahrenheit(max));
                displayUnit = '°F';
            } else {
                displayMin = min;
                displayMax = max;
                displayUnit = '°C';
            }
        } else {
            currentValue = parseInt(slider.value);
            displayMin = min;
            displayMax = max;
            displayUnit = unit;
        }
        
        element.classList.add('editing');
        
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'range-value-input';
        input.min = displayMin;
        input.max = displayMax;
        
        if (isTemperature && isFahrenheit) {
            input.value = Math.round(celsiusToFahrenheit(currentValue));
        } else {
            input.value = currentValue;
        }
        
        input.step = 1;
        
        element.innerHTML = '';
        element.appendChild(input);
        
        // Ensure input gets focus
        setTimeout(() => {
            input.focus();
            input.select();
        }, 10);
        
        function finishEdit() {
            let newValue = parseInt(input.value);
            let validValue = newValue;
            
            // Clamp value to min/max in display units
            if (newValue < displayMin) validValue = displayMin;
            if (newValue > displayMax) validValue = displayMax;
            if (isNaN(newValue)) {
                if (isTemperature && isFahrenheit) {
                    validValue = Math.round(celsiusToFahrenheit(currentValue));
                } else {
                    validValue = currentValue;
                }
            }
            
            // Convert back to Celsius for slider if this is temperature
            let sliderValue = validValue;
            if (isTemperature && isFahrenheit) {
                sliderValue = Math.round(fahrenheitToCelsius(validValue));
                // Clamp to original Celsius range
                if (sliderValue < min) sliderValue = min;
                if (sliderValue > max) sliderValue = max;
            }
            
            // Update slider and display
            slider.value = sliderValue;
            element.classList.remove('editing');
            
            if (isTemperature) {
                if (isFahrenheit) {
                    element.textContent = `${Math.round(celsiusToFahrenheit(sliderValue))}°F`;
                } else {
                    element.textContent = `${sliderValue}°C`;
                }
            } else {
                element.textContent = `${validValue}${displayUnit}`;
            }
            
            // Trigger the slider's input event to update the system
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Enter') {
                finishEdit();
            } else if (e.key === 'Escape') {
                element.classList.remove('editing');
                if (isTemperature) {
                    if (isFahrenheit) {
                        element.textContent = `${Math.round(celsiusToFahrenheit(currentValue))}°F`;
                    } else {
                        element.textContent = `${currentValue}°C`;
                    }
                } else {
                    element.textContent = `${currentValue}${displayUnit}`;
                }
            }
        });
        
        // Prevent input events from bubbling and interfering with other handlers
        input.addEventListener('input', function(e) {
            e.stopPropagation();
        });
        
        input.addEventListener('focus', function(e) {
            e.stopPropagation();
        });
    });
}

// Initialize editable range values
makeRangeValueEditable(tempValue, tempSlider, 25, 320, '°C', true); // true indicates temperature field
makeRangeValueEditable(steamValue, steamSlider, 0, 100, '%');
makeRangeValueEditable(fanValue, fanSlider, 0, 100, '%');

// Touch-based drag and drop alternative using long press
function addTouchDragAndDrop(element, presetId) {
    let isDragging = false;
    let dragStartPosition = null;
    let draggedElement = null;
    
    function createDragPreview(element) {
        const preview = element.cloneNode(true);
        preview.style.position = 'fixed';
        preview.style.opacity = '0.8';
        preview.style.transform = 'scale(0.9)';
        preview.style.zIndex = '9999';
        preview.style.pointerEvents = 'none';
        preview.style.transition = 'none';
        preview.classList.add('drag-preview');
        document.body.appendChild(preview);
        return preview;
    }
    
    function updateDragPreview(preview, x, y) {
        if (preview) {
            preview.style.left = (x - 50) + 'px';
            preview.style.top = (y - 25) + 'px';
        }
    }
    
    function removeDragPreview(preview) {
        if (preview && preview.parentNode) {
            preview.parentNode.removeChild(preview);
        }
    }
    
    function findDropTarget(x, y) {
        const elements = document.elementsFromPoint(x, y);
        return elements.find(el => 
            el !== draggedElement && 
            el.dataset.presetId && 
            el.classList.contains('button')
        );
    }
    
    element.addEventListener('touchstart', (e) => {
        // Only start drag if this is not interfering with long press for context menu
        setTimeout(() => {
            if (!element.classList.contains('long-press-active')) {
                dragStartPosition = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                };
            }
        }, 600); // Start after long press threshold
    });
    
    element.addEventListener('touchmove', (e) => {
        if (dragStartPosition && !isDragging) {
            const deltaX = Math.abs(e.touches[0].clientX - dragStartPosition.x);
            const deltaY = Math.abs(e.touches[0].clientY - dragStartPosition.y);
            
            // Start dragging if moved more than 15px
            if (deltaX > 15 || deltaY > 15) {
                isDragging = true;
                draggedElement = createDragPreview(element);
                element.style.opacity = '0.5';
                
                // Provide haptic feedback
                if (navigator.vibrate) {
                    navigator.vibrate(30);
                }
            }
        }
        
        if (isDragging && draggedElement) {
            e.preventDefault();
            updateDragPreview(draggedElement, e.touches[0].clientX, e.touches[0].clientY);
            
            // Highlight potential drop targets
            const dropTarget = findDropTarget(e.touches[0].clientX, e.touches[0].clientY);
            document.querySelectorAll('.button[data-preset-id]').forEach(btn => {
                btn.classList.remove('drag-over');
            });
            if (dropTarget && dropTarget !== element) {
                dropTarget.classList.add('drag-over');
            }
        }
    });
    
    element.addEventListener('touchend', (e) => {
        if (isDragging) {
            e.preventDefault();
            
            const dropTarget = findDropTarget(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            
            if (dropTarget && dropTarget !== element) {
                // Perform the reorder
                const draggedId = element.dataset.presetId;
                const targetId = dropTarget.dataset.presetId;
                
                const draggedIndex = presetOrder.indexOf(draggedId);
                const targetIndex = presetOrder.indexOf(targetId);
                
                presetOrder.splice(draggedIndex, 1);
                presetOrder.splice(targetIndex, 0, draggedId);
                
                savePresetsToStorage();
                renderPresets();
                
                // Provide haptic feedback for successful drop
                if (navigator.vibrate) {
                    navigator.vibrate([50, 50, 50]);
                }
            }
            
            // Cleanup
            removeDragPreview(draggedElement);
            element.style.opacity = '';
            document.querySelectorAll('.button[data-preset-id]').forEach(btn => {
                btn.classList.remove('drag-over');
            });
        }
        
        isDragging = false;
        dragStartPosition = null;
        draggedElement = null;
    });
}