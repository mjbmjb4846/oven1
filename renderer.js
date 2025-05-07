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

// Chart initialization
const ctx = document.getElementById('temp-chart').getContext('2d');
const tempChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(30).fill(''),
        datasets: [{
            label: 'Temperature (°C)',
            data: Array(30).fill(25),
            borderColor: '#e63946',
            backgroundColor: 'rgba(230, 57, 70, 0.1)',
            tension: 0.4,
            fill: true
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: false,
                min: 20,
                max: 310
            }
        },
        animation: {
            duration: 500
        },
        plugins: {
            legend: {
                display: false
            }
        }
    }
});

// System state
let systemRunning = false;
let currentTemp = 25;
let targetTemp = 150;
let fanSpeed = 0;
let steamLevel = 0;
let pressureLevel = 0;
let isRecording = true; // Default to true as we start recording on app launch

// Preset system state
let currentEditingPresetId = null;
let selectedPresetElement = null;
let draggingElement = null;

// Load saved presets from localStorage with support for order
let presets = {};
let presetOrder = [];

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
    targetTemp = parseInt(tempSlider.value);
    tempValue.textContent = `${targetTemp}°C`;
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
    
    if (!isOn) {
        fanSlider.value = 0;
        fanValue.textContent = '0%';
        fanSpeed = 0;
    }
    
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
    
    ipcRenderer.send('start-system');
    
    // Begin simulation
    startSimulation();
}

// Stop the system - modified to keep recording data while cooling
function stopSystem() {
    systemRunning = false;
    heatingToggle.checked = false;
    fanToggle.checked = false;
    solenoidToggle.checked = false;
    
    updateHeatingStatus(false);
    updateFanStatus(false);
    updateSteamStatus(false);
    
    // No longer disabling the steam slider
    
    // Send stop command but don't stop monitoring/recording
    ipcRenderer.send('stop-system');
    
    // Stop simulation but continue to show temperature changes as system cools
    if (simulationInterval) {
        clearInterval(simulationInterval);
    }
    
    // Start a cooling simulation instead
    startCoolingSimulation();
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

// Simulation variables
let simulationInterval;

// Simple temperature simulation
function startSimulation() {
    stopSimulation();
    
    simulationInterval = setInterval(() => {
        // Simulate temperature changes
        if (heatingToggle.checked && currentTemp < targetTemp) {
            currentTemp += 1 + Math.random();
        } else if (!heatingToggle.checked || currentTemp > targetTemp) {
            currentTemp -= 0.5 + Math.random() * 0.5;
        }
        
        // Add some noise to make it realistic
        currentTemp += (Math.random() - 0.5) * 0.5;
        currentTemp = Math.max(25, Math.min(300, currentTemp));
        currentTempDisplay.textContent = Math.round(currentTemp);
        
        // Update chart
        tempChart.data.datasets[0].data.shift();
        tempChart.data.datasets[0].data.push(currentTemp);
        tempChart.update();
        
        // Simulate pressure sensor (0-3V)
        if (solenoidToggle.checked) {
            pressureLevel = 1 + Math.random() * 2; // 1-3V when steam valve is on
        } else {
            pressureLevel = Math.random(); // 0-1V when steam valve is off
        }
        
        const pressurePct = (pressureLevel / 3) * 100;
        pressureGauge.style.width = `${pressurePct}%`;
        pressureValue.textContent = `${pressureLevel.toFixed(2)} V`;
        
        // Send data to main process
        ipcRenderer.send('update-data', {
            temperature: currentTemp,
            pressure: pressureLevel
        });
    }, 1000);
}

function stopSimulation() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
    }
}

// Simulate cooling after the system is stopped
function startCoolingSimulation() {
    simulationInterval = setInterval(() => {
        // Simulate gradual cooling
        if (currentTemp > 25) {
            currentTemp -= 0.3 + Math.random() * 0.3;
        }
        
        // Add some noise to make it realistic
        currentTemp += (Math.random() - 0.5) * 0.2;
        currentTemp = Math.max(25, currentTemp);
        currentTempDisplay.textContent = Math.round(currentTemp);
        
        // Update chart
        tempChart.data.datasets[0].data.shift();
        tempChart.data.datasets[0].data.push(currentTemp);
        tempChart.update();
        
        // Simulate pressure decreasing
        pressureLevel = Math.max(0, pressureLevel - 0.1 * Math.random());
        const pressurePct = (pressureLevel / 3) * 100;
        pressureGauge.style.width = `${pressurePct}%`;
        pressureValue.textContent = `${pressureLevel.toFixed(2)} V`;
        
        // Send data to main process for recording
        ipcRenderer.send('update-data', {
            temperature: currentTemp,
            pressure: pressureLevel
        });
        
        // Stop cooling simulation when temperature gets close to room temperature
        if (currentTemp <= 25.5) {
            clearInterval(simulationInterval);
        }
    }, 1000);
}

// Handle temperature updates from main process
ipcRenderer.on('temperature-reading', (event, temp) => {
    if (!systemRunning) return;
    
    currentTemp = temp;
    currentTempDisplay.textContent = Math.round(currentTemp);
    
    // Update chart
    tempChart.data.datasets[0].data.shift();
    tempChart.data.datasets[0].data.push(currentTemp);
    tempChart.update();
});

// Handle pressure updates from main process
ipcRenderer.on('pressure-reading', (event, pressure) => {
    if (!systemRunning) return;
    
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