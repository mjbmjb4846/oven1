const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// System event emitter
const systemEvents = new EventEmitter();

// Board detection and information
const boardInfo = {
  type: 'unknown', // 'raspberry-pi', 'orange-pi', or 'unknown'
  model: 'unknown',
  gpioLibrary: null
};

// Detect board type
function detectBoardType() {
  if (process.platform !== 'linux') {
    console.log('Not running on Linux, assuming development mode');
    return 'unknown';
  }

  try {
    // Check for Raspberry Pi
    if (fs.existsSync('/sys/firmware/devicetree/base/model')) {
      const model = fs.readFileSync('/sys/firmware/devicetree/base/model', 'utf8');
      if (model.toLowerCase().includes('raspberry pi')) {
        boardInfo.type = 'raspberry-pi';
        boardInfo.model = model.trim();
        console.log(`Detected ${boardInfo.model}`);
        return 'raspberry-pi';
      }
    }

    // Check for Orange Pi
    if (fs.existsSync('/sys/class/sunxi_info/sys_info')) {
      boardInfo.type = 'orange-pi';
      // Try to determine specific model
      try {
        const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
        if (cpuinfo.includes('H618')) {
          boardInfo.model = 'Orange Pi Zero 3';
        } else {
          boardInfo.model = 'Orange Pi (Generic)';
        }
      } catch (err) {
        boardInfo.model = 'Orange Pi (Unknown Model)';
      }
      console.log(`Detected ${boardInfo.model}`);
      return 'orange-pi';
    }

    // If we can't determine specifically, but we're on ARM Linux, assume compatible
    if (process.arch === 'arm' || process.arch === 'arm64') {
      console.log('Running on ARM Linux, assuming compatible SBC');
      boardInfo.type = 'generic-arm';
      boardInfo.model = 'Generic ARM SBC';
      return 'generic-arm';
    }
  } catch (error) {
    console.error('Error detecting board type:', error);
  }

  console.log('Unknown board type, using simulation mode');
  return 'unknown';
}

// Define GPIO pins mapping for different boards
const PIN_MAPPINGS = {
  'raspberry-pi': {
    FAN_CONTROL: 17,
    HEATING_ELEMENTS: [22, 23, 24],
    SOLENOID_VALVE: 18,
    PRESSURE_SENSOR: 0, // ADC channel
    TEMP_PROBE: 4
  },
  'orange-pi': {
    // Orange Pi Zero 3 pin mapping (adjusted for H618 SoC)
    FAN_CONTROL: 7,  // PC07
    HEATING_ELEMENTS: [8, 9, 10], // PC08, PC09, PC10
    SOLENOID_VALVE: 6, // PC06
    PRESSURE_SENSOR: 0, // ADC channel, if available
    TEMP_PROBE: 3   // PC03
  },
  'generic-arm': {
    // Generic fallback using lower pin numbers that are likely available
    FAN_CONTROL: 17,
    HEATING_ELEMENTS: [22, 23, 24],
    SOLENOID_VALVE: 18,
    PRESSURE_SENSOR: 0,
    TEMP_PROBE: 4
  },
  'unknown': {
    // Simulation mode - pin values don't matter
    FAN_CONTROL: 17,
    HEATING_ELEMENTS: [22, 23, 24],
    SOLENOID_VALVE: 18,
    PRESSURE_SENSOR: 0,
    TEMP_PROBE: 4
  }
};

// Initialize board type and determine pin mapping
detectBoardType();
const PINS = PIN_MAPPINGS[boardInfo.type] || PIN_MAPPINGS.unknown;

// Initialize pins
let fan = null;
let heatingElements = [];
let solenoidValve = null;
let pressureSensor = null;
let tempProbe = null;

// CSV data recording
let csvFilePath = null;
let dataRecordingInterval = null;
let recordingIntervalSeconds = 5;

// Check if running on a supported board
const isCompatibleBoard = boardInfo.type !== 'unknown';

// GPIO module - will be dynamically loaded
let gpio = null;

// Try to load sysfs GPIO as a fallback method
function createSysFsGpio(pin, direction) {
  const gpioPath = `/sys/class/gpio/gpio${pin}`;
  
  try {
    // Export the GPIO if not already exported
    if (!fs.existsSync(gpioPath)) {
      try {
        fs.writeFileSync('/sys/class/gpio/export', pin.toString());
        // Give the system time to create the GPIO files
        execSync('sleep 0.1');
      } catch (exportErr) {
        console.error(`Permission denied when exporting GPIO ${pin}. This is usually a permissions issue.`);
        console.log(`Please run 'sudo chmod -R a+rw /sys/class/gpio' or run the application with sudo`);
        
        // Try with sudo if normal export fails
        try {
          execSync(`echo ${pin} | sudo tee /sys/class/gpio/export`);
          // Give the system time to create the GPIO files
          execSync('sleep 0.5');
        } catch (sudoErr) {
          throw new Error(`Failed to export GPIO ${pin} even with sudo`);
        }
      }
    }
    
    // Set direction
    try {
      fs.writeFileSync(`${gpioPath}/direction`, direction);
    } catch (dirErr) {
      console.error(`Permission denied when setting direction for GPIO ${pin}`);
      try {
        execSync(`echo ${direction} | sudo tee ${gpioPath}/direction`);
      } catch (sudoDirErr) {
        throw new Error(`Failed to set direction for GPIO ${pin}`);
      }
    }
    
    return {
      pin,
      writeSync: (value) => {
        try {
          fs.writeFileSync(`${gpioPath}/value`, value.toString());
          return true;
        } catch (error) {
          console.error(`Failed to write to GPIO ${pin}:`, error.message);
          // Try with sudo as a last resort
          try {
            execSync(`echo ${value} | sudo tee ${gpioPath}/value > /dev/null`);
            console.log(`Used sudo to set GPIO ${pin} to ${value}`);
            return true;
          } catch (sudoError) {
            console.error(`Failed to set GPIO ${pin} even with sudo:`, sudoError.message);
            return false;
          }
        }
      },
      readSync: () => {
        try {
          return parseInt(fs.readFileSync(`${gpioPath}/value`, 'utf8').trim());
        } catch (error) {
          console.error(`Failed to read from GPIO ${pin}:`, error.message);
          // Try with sudo as a last resort
          try {
            return parseInt(execSync(`sudo cat ${gpioPath}/value`).toString().trim());
          } catch (sudoError) {
            console.error(`Failed to read GPIO ${pin} even with sudo:`, sudoError.message);
            return -1;
          }
        }
      },
      unexport: () => {
        try {
          fs.writeFileSync('/sys/class/gpio/unexport', pin.toString());
        } catch (error) {
          console.error(`Failed to unexport GPIO ${pin}:`, error.message);
          // Try with sudo
          try {
            execSync(`echo ${pin} | sudo tee /sys/class/gpio/unexport > /dev/null`);
          } catch (sudoErr) {
            // Just log the error, don't throw
            console.error(`Failed to unexport GPIO ${pin} even with sudo:`, sudoErr.message);
          }
        }
      }
    };
  } catch (error) {
    console.error(`Failed to setup GPIO ${pin} with sysfs:`, error);
    return {
      pin,
      writeSync: (value) => { 
        console.log(`Simulating GPIO ${pin} write: ${value}`); 
        return false; 
      },
      readSync: () => { 
        console.log(`Simulating GPIO ${pin} read`); 
        return -1; 
      },
      unexport: () => { 
        console.log(`Simulating GPIO ${pin} unexport`); 
      }
    };
  }
}

// Try loading different GPIO libraries based on the detected board
function loadGpioLibrary() {
  // First try the appropriate library based on board type
  if (boardInfo.type === 'raspberry-pi') {
    try {
      const onoff = require('onoff');
      boardInfo.gpioLibrary = 'onoff';
      return onoff;
    } catch (error) {
      console.warn('Failed to load onoff library:', error.message);
    }
  }
  
  if (boardInfo.type === 'orange-pi') {
    try {
      const orangePiGpio = require('node-orange-pi-gpio');
      boardInfo.gpioLibrary = 'node-orange-pi-gpio';
      return orangePiGpio;
    } catch (error) {
      console.warn('Failed to load node-orange-pi-gpio library:', error.message);
      try {
        // Try alternate library
        const wiringOp = require('wiring-op');
        boardInfo.gpioLibrary = 'wiring-op';
        return wiringOp;
      } catch (opError) {
        console.warn('Failed to load wiring-op library:', opError.message);
      }
    }
  }
  
  // Try rpio as a more generic option
  try {
    const rpio = require('rpio');
    boardInfo.gpioLibrary = 'rpio';
    return rpio;
  } catch (error) {
    console.warn('Failed to load rpio library:', error.message);
  }
  
  // If no libraries are available, use our sysfs implementation
  console.log('No GPIO libraries found, falling back to sysfs implementation');
  boardInfo.gpioLibrary = 'sysfs';
  return {
    Gpio: (pin, direction) => createSysFsGpio(pin, direction === 'out' ? 'out' : 'in'),
    isSysFsImplementation: true
  };
}

// Initialize GPIO pins
function initializeGPIO() {
  if (!isCompatibleBoard) {
    console.log('Running in development mode - GPIO functionality simulated');
    return true;
  }

  try {
    gpio = loadGpioLibrary();
    
    if (!gpio) {
      console.error('Failed to load any GPIO library, running in simulation mode');
      return false;
    }
    
    console.log(`Using GPIO library: ${boardInfo.gpioLibrary}`);
    
    // Initialize outputs based on the library we're using
    if (boardInfo.gpioLibrary === 'onoff') {
      fan = new gpio.Gpio(PINS.FAN_CONTROL, 'out');
      heatingElements = PINS.HEATING_ELEMENTS.map(pin => new gpio.Gpio(pin, 'out'));
      solenoidValve = new gpio.Gpio(PINS.SOLENOID_VALVE, 'out');
    } 
    else if (boardInfo.gpioLibrary === 'node-orange-pi-gpio') {
      // Orange Pi specific implementation
      gpio.setup();
      fan = { pin: PINS.FAN_CONTROL, writeSync: (value) => gpio.write(PINS.FAN_CONTROL, value) };
      heatingElements = PINS.HEATING_ELEMENTS.map(pin => ({ 
        pin, 
        writeSync: (value) => gpio.write(pin, value) 
      }));
      solenoidValve = { pin: PINS.SOLENOID_VALVE, writeSync: (value) => gpio.write(PINS.SOLENOID_VALVE, value) };
    }
    else if (boardInfo.gpioLibrary === 'wiring-op') {
      // Wiring-op library initialization
      gpio.setup();
      fan = { pin: PINS.FAN_CONTROL, writeSync: (value) => gpio.digitalWrite(PINS.FAN_CONTROL, value) };
      heatingElements = PINS.HEATING_ELEMENTS.map(pin => ({ 
        pin, 
        writeSync: (value) => gpio.digitalWrite(pin, value) 
      }));
      solenoidValve = { pin: PINS.SOLENOID_VALVE, writeSync: (value) => gpio.digitalWrite(PINS.SOLENOID_VALVE, value) };
    }
    else if (boardInfo.gpioLibrary === 'rpio') {
      // Initialize with rpio
      gpio.init();
      gpio.open(PINS.FAN_CONTROL, gpio.OUTPUT, gpio.LOW);
      fan = { 
        pin: PINS.FAN_CONTROL, 
        writeSync: (value) => gpio.write(PINS.FAN_CONTROL, value ? gpio.HIGH : gpio.LOW),
        unexport: () => gpio.close(PINS.FAN_CONTROL)
      };
      
      heatingElements = PINS.HEATING_ELEMENTS.map(pin => {
        gpio.open(pin, gpio.OUTPUT, gpio.LOW);
        return { 
          pin,
          writeSync: (value) => gpio.write(pin, value ? gpio.HIGH : gpio.LOW),
          unexport: () => gpio.close(pin)
        };
      });
      
      gpio.open(PINS.SOLENOID_VALVE, gpio.OUTPUT, gpio.LOW);
      solenoidValve = { 
        pin: PINS.SOLENOID_VALVE, 
        writeSync: (value) => gpio.write(PINS.SOLENOID_VALVE, value ? gpio.HIGH : gpio.LOW),
        unexport: () => gpio.close(PINS.SOLENOID_VALVE)
      };
    }
    else if (boardInfo.gpioLibrary === 'sysfs') {
      // Using our sysfs implementation
      fan = gpio.Gpio(PINS.FAN_CONTROL, 'out');
      heatingElements = PINS.HEATING_ELEMENTS.map(pin => gpio.Gpio(pin, 'out'));
      solenoidValve = gpio.Gpio(PINS.SOLENOID_VALVE, 'out');
    }
    
    console.log('GPIO pins initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize GPIO:', error);
    return false;
  }
}

// Clean up GPIO resources
function cleanupGPIO() {
  if (!isCompatibleBoard) return;
  
  try {
    // Generic cleanup based on the library we're using
    if (boardInfo.gpioLibrary === 'onoff' || boardInfo.gpioLibrary === 'sysfs') {
      if (fan) fan.unexport();
      if (heatingElements.length) heatingElements.forEach(element => element.unexport());
      if (solenoidValve) solenoidValve.unexport();
    }
    else if (boardInfo.gpioLibrary === 'rpio') {
      if (fan) fan.unexport();
      if (heatingElements.length) heatingElements.forEach(element => element.unexport());
      if (solenoidValve) solenoidValve.unexport();
      gpio.exit();
    }
    // node-orange-pi-gpio and wiring-op don't need explicit cleanup
    
    console.log('GPIO resources cleaned up');
  } catch (error) {
    console.error('Error cleaning up GPIO resources:', error);
  }
}

// Control fan speed (0-100%)
function setFanSpeed(speed) {
  const pwmValue = Math.floor((speed / 100) * 255); // Convert percentage to PWM value
  
  if (isCompatibleBoard && fan) {
    // In a real implementation, you would use hardware PWM 
    // This simplified version just toggles on/off based on speed
    fan.writeSync(pwmValue > 0 ? 1 : 0);
    console.log(`Setting fan speed to ${speed}% (PWM: ${pwmValue})`);
  } else {
    // Simulate fan control in development mode
    console.log(`[DEV] Setting fan speed to ${speed}% (PWM: ${pwmValue})`);
  }
  
  // Update system state
  fanSpeed = speed;
  
  // Emit event for data logging
  systemEvents.emit('fan-change', speed);
  
  return true;
}

// Control heating elements
function setHeatingElements(isOn) {
  if (isCompatibleBoard && heatingElements.length) {
    // Turn all heating elements on or off
    heatingElements.forEach(element => element.writeSync(isOn ? 1 : 0));
    console.log(`Setting heating elements to ${isOn ? 'ON' : 'OFF'}`);
  } else {
    // Simulate heating elements control in development mode
    console.log(`[DEV] Setting heating elements to ${isOn ? 'ON' : 'OFF'}`);
  }
  
  // Update system state
  heatingElementsOn = isOn;
  
  // Emit event for data logging
  systemEvents.emit('heating-change', isOn);
  
  return true;
}

// Control solenoid valve for steam
function setSolenoidValve(isOpen) {
  if (isCompatibleBoard && solenoidValve) {
    solenoidValve.writeSync(isOpen ? 1 : 0);
    console.log(`Setting solenoid valve to ${isOpen ? 'OPEN' : 'CLOSED'}`);
  } else {
    // Simulate solenoid valve control in development mode
    console.log(`[DEV] Setting solenoid valve to ${isOpen ? 'OPEN' : 'CLOSED'}`);
  }
  
  // Update system state
  solenoidValveOpen = isOpen;
  
  // Emit event for data logging
  systemEvents.emit('solenoid-change', isOpen);
  
  return true;
}

// Read temperature from probe (DS18B20)
function readTemperatureProbe() {
  if (isCompatibleBoard) {
    try {
      // Read from DS18B20 sensor
      const devicePath = '/sys/bus/w1/devices';
      if (fs.existsSync(devicePath)) {
        // Find DS18B20 device folder (starts with 28-)
        const devices = fs.readdirSync(devicePath)
          .filter(folder => folder.startsWith('28-'));
        
        if (devices.length > 0) {
          // Read temperature from the first DS18B20 sensor found
          const sensorPath = path.join(devicePath, devices[0], 'temperature');
          if (fs.existsSync(sensorPath)) {
            const data = fs.readFileSync(sensorPath, 'utf8');
            // Convert the value (in millidegrees C) to degrees C
            const tempC = parseInt(data.trim()) / 1000.0;
            return tempC;
          }
        }
      }
      
      // If we can't read from the sensor, return a simulated value
      console.log('DS18B20 sensor not found, using simulated values');
      const baseTemp = 25; // Room temperature
      const variation = Math.random() * 2 - 1; // -1 to 1 degree variation
      return baseTemp + variation;
    } catch (error) {
      console.error('Error reading temperature probe:', error);
      return 25; // Default to room temperature on error
    }
  } else {
    // Simulate temperature probe in development mode
    const baseTemp = 25; // Room temperature
    const variation = Math.random() * 2 - 1; // -1 to 1 degree variation
    return baseTemp + variation;
  }
}

// Read pressure sensor value (0-3V)
function readPressureSensor() {
  if (isCompatibleBoard) {
    // Try to read from ADC if available
    try {
      // This is a placeholder for ADC reading code that would depend on the board
      // In a real implementation, you would use the appropriate ADC library
      
      // For Orange Pi Zero 3, use the appropriate ADC method if available
      if (boardInfo.type === 'orange-pi' && boardInfo.gpioLibrary === 'node-orange-pi-gpio' && gpio.readAdc) {
        const adcValue = gpio.readAdc(PINS.PRESSURE_SENSOR);
        // Convert ADC value to voltage (assuming 12-bit ADC with 3.3V reference)
        const voltage = (adcValue / 4095) * 3.3;
        return voltage;
      }
      
      // For Raspberry Pi, you might use an external ADC chip like MCP3008
      
      // If no ADC reading method is available, return simulated values
      throw new Error('No ADC reading method available');
    } catch (error) {
      // Simulate pressure sensor reading
      const voltage = Math.random() * 3; // Simulate 0-3V range
      console.log(`Simulated pressure sensor: ${voltage.toFixed(2)}V`);
      return voltage;
    }
  } else {
    // Simulate pressure sensor reading in development mode
    const voltage = Math.random() * 3; // Simulate 0-3V range
    console.log(`[DEV] Simulated pressure sensor: ${voltage.toFixed(2)}V`);
    return voltage;
  }
}

// Initialize CSV data recording
function initializeDataRecording() {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const downloadsFolder = path.join(os.homedir(), 'Downloads');
  csvFilePath = path.join(downloadsFolder, `oven_data_${timestamp}.csv`);
  
  try {
    // Create CSV header with board information
    const header = `# Board: ${boardInfo.model}, GPIO Library: ${boardInfo.gpioLibrary}\n` +
                  'Timestamp,Temperature (°C),Pressure (V),Heating,Fan (%),Steam\n';
    fs.writeFileSync(csvFilePath, header);
    
    console.log(`Data recording initialized. CSV file: ${csvFilePath}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize data recording:', error);
    return false;
  }
}

// Record data point to CSV
function recordDataPoint(temperature, pressure, heating, fan, steam) {
  if (!csvFilePath) return false;
  
  try {
    const timestamp = new Date().toISOString();
    const dataPoint = `${timestamp},${temperature.toFixed(2)},${pressure.toFixed(2)},${heating ? 'ON' : 'OFF'},${fan},${steam ? 'ON' : 'OFF'}\n`;
    
    fs.appendFileSync(csvFilePath, dataPoint);
    return true;
  } catch (error) {
    console.error('Failed to record data point:', error);
    return false;
  }
}

// Start continuous data recording
function startDataRecording(callback, intervalSeconds = 5) {
  recordingIntervalSeconds = intervalSeconds;
  
  if (!csvFilePath && !initializeDataRecording()) {
    console.error('Failed to start data recording');
    return null;
  }
  
  dataRecordingInterval = setInterval(() => {
    // Get current sensor readings
    const temperature = isCompatibleBoard ? readTemperatureProbe() : currentTemp;
    const pressure = readPressureSensor();
    
    // Record data point
    recordDataPoint(
      temperature,
      pressure,
      heatingElementsOn,
      fanSpeed,
      solenoidValveOpen
    );
    
    if (callback) {
      callback({
        temperature,
        pressure,
        timestamp: new Date().toISOString()
      });
    }
  }, recordingIntervalSeconds * 1000);
  
  return dataRecordingInterval;
}

// Update recording interval
function updateRecordingInterval(intervalSeconds) {
  if (intervalSeconds < 1) intervalSeconds = 1; // Minimum 1 second
  
  recordingIntervalSeconds = intervalSeconds;
  
  // Restart recording with new interval if already recording
  if (dataRecordingInterval) {
    clearInterval(dataRecordingInterval);
    startDataRecording(null, recordingIntervalSeconds);
  }
  
  return recordingIntervalSeconds;
}

// Stop data recording
function stopDataRecording() {
  if (dataRecordingInterval) {
    clearInterval(dataRecordingInterval);
    dataRecordingInterval = null;
    return true;
  }
  return false;
}

// Start continuous pressure sensor monitoring
function startPressureMonitoring(callback, interval = 1000) {
  const monitoringInterval = setInterval(() => {
    const pressureValue = readPressureSensor();
    callback(pressureValue);
  }, interval);
  
  return monitoringInterval;
}

// Stop pressure sensor monitoring
function stopPressureMonitoring(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    return true;
  }
  return false;
}

// Temperature control PID simulation (in a real system, you would use a temperature sensor)
function simulateTemperatureControl(targetTemp, currentTemp) {
  // Simple temperature simulation
  let delta = 0;
  
  if (currentTemp < targetTemp - 5) {
    // Heat up faster when far from target
    delta = 2 + Math.random();
  } else if (currentTemp < targetTemp) {
    // Heat up slower when close to target
    delta = 0.5 + Math.random() * 0.5;
  } else if (currentTemp > targetTemp + 5) {
    // Cool down faster when far above target
    delta = -1 - Math.random();
  } else if (currentTemp > targetTemp) {
    // Cool down slower when close to target
    delta = -0.3 - Math.random() * 0.3;
  }
  
  // Add some noise
  delta += (Math.random() - 0.5) * 0.2;
  
  return currentTemp + delta;
}

// System state variables
let currentTemp = 25;
let fanSpeed = 0;
let heatingElementsOn = false;
let solenoidValveOpen = false;

module.exports = {
  initializeGPIO,
  cleanupGPIO,
  setFanSpeed,
  setHeatingElements,
  setSolenoidValve,
  readPressureSensor,
  readTemperatureProbe,
  startPressureMonitoring,
  stopPressureMonitoring,
  simulateTemperatureControl,
  initializeDataRecording,
  startDataRecording,
  stopDataRecording,
  updateRecordingInterval,
  systemEvents,
  isCompatibleBoard,
  boardInfo
};