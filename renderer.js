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

// New DOM elements for simulation and recording
const simulationIndicator = document.getElementById('simulation-indicator');
const recordingInterval = document.getElementById('recording-interval');
const recordingStatusText = document.getElementById('recording-status-text');

// Preset Management DOM Elements
const presetsContainer = document.getElementById('presets-container');
const savePresetBtn = document.getElementById('save-preset-btn');
const contextMenu = document.getElementById('context-menu');
const editPresetOption = document.getElementById('edit-preset');
const deletePresetOption = document.getElementById('delete-preset');
const presetModal = document.getElementById('preset-modal');
const modalTitle = document.getElementById('modal-title');
const presetNameInput = document.getElementById('preset-name');
const presetDescriptionInput = document.getElementById('preset-description');
const cancelPresetBtn = document.getElementById('cancel-preset');
const confirmPresetBtn = document.getElementById('confirm-preset');
const closeModalBtn = document.querySelector('.close-modal');

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
    } else {
        // Default presets
        presets = {
            chicken: {
                name: 'Chicken',
                description: 'For cooking chicken',
                temp: 180,
                fan: 40,
                steam: false
            },
            beef: {
                name: 'Beef',
                description: 'For cooking beef', 
                temp: 200,
                fan: 60,
                steam: false
            },
            apple: {
                name: 'Apple',
                description: 'For drying apple slices',
                temp: 75,
                fan: 100,
                steam: false
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
        presetBtn.innerHTML = `${preset.name}<span class="preset-desc">(${preset.description || ''})</span>`;
        
        // Add event listeners
        presetBtn.addEventListener('click', () => applyPreset(id));
        presetBtn.addEventListener('contextmenu', (e) => showContextMenu(e, id, presetBtn));
        presetBtn.addEventListener('dblclick', (e) => showEditPresetModal(id));
        
        // Add drag-and-drop event listeners
        presetBtn.setAttribute('draggable', 'true');
        presetBtn.addEventListener('dragstart', handleDragStart);
        presetBtn.addEventListener('dragend', handleDragEnd);
        presetBtn.addEventListener('dragover', handleDragOver);
        presetBtn.addEventListener('dragenter', handleDragEnter);
        presetBtn.addEventListener('dragleave', handleDragLeave);
        presetBtn.addEventListener('drop', handleDrop);
        
        presetsContainer.appendChild(presetBtn);
    });
}

// Show the context menu for preset options
function showContextMenu(e, presetId, element) {
    e.preventDefault();
    
    // Save the selected preset ID and element
    selectedPresetElement = element;
    currentEditingPresetId = presetId;
    
    // Position the context menu
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.display = 'block';
    
    // Add global click event to close the menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu);
    }, 0);
}

// Hide the context menu
function hideContextMenu() {
    contextMenu.style.display = 'none';
    document.removeEventListener('click', hideContextMenu);
}

// Show the modal for creating a new preset
function showCreatePresetModal() {
    modalTitle.textContent = 'Save as Preset';
    presetNameInput.value = '';
    presetDescriptionInput.value = '';
    currentEditingPresetId = null;
    
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
    
    // Display the modal
    presetModal.style.display = 'flex';
}

// Close the preset modal
function hidePresetModal() {
    presetModal.style.display = 'none';
    presetNameInput.value = '';
    presetDescriptionInput.value = '';
}

// Save the current settings as a new preset
function createPreset() {
    const name = presetNameInput.value.trim();
    const description = presetDescriptionInput.value.trim();
    
    if (!name) {
        alert('Please enter a name for the preset');
        return;
    }
    
    // Create preset object with current settings - save slider values regardless of toggle state
    const preset = {
        name: name,
        description: description,
        temp: parseInt(tempSlider.value),
        fan: parseInt(fanSlider.value),     // Always save the fan slider value regardless of toggle state
        steam: parseInt(steamSlider.value)  // Save steam slider value instead of toggle state
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

// Start the system
function startSystem() {
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

// Initialize the application
function init() {
    renderPresets();
    
    // Add event listener to document to handle clicks outside context menu
    document.addEventListener('click', (e) => {
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
        
        input.focus();
        input.select();
        
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
    });
}

// Initialize editable range values
makeRangeValueEditable(tempValue, tempSlider, 25, 320, '°C', true); // true indicates temperature field
makeRangeValueEditable(steamValue, steamSlider, 0, 100, '%');
makeRangeValueEditable(fanValue, fanSlider, 0, 100, '%');