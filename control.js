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
    FAN_CONTROL: 17,       // BCM 17 = Physical Pin 11
    HEATING_ELEMENTS: [22, 23, 24], // BCM 22, 23, 24 = Physical Pins 15, 16, 18
    SOLENOID_VALVE: 18,    // BCM 18 = Physical Pin 12
    PRESSURE_SENSOR: 0,    // ADC channel
    TEMP_PROBE: 4          // BCM 4 = Physical Pin 7 (for DS18B20 1-Wire)
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

// Helper function to convert between BCM and physical pin numbers for Raspberry Pi
// This helps users connect hardware correctly
const RPI_BCM_TO_PHYSICAL = {
  2: 3,   // I2C SDA
  3: 5,   // I2C SCL
  4: 7,   // 1-Wire
  17: 11, // Fan control
  18: 12, // Solenoid
  22: 15, // Heating element 1
  23: 16, // Heating element 2
  24: 18, // Heating element 3
  27: 13  // General purpose
};

// Get physical pin number from BCM
function getPhysicalPinNumber(bcmPin) {
  return RPI_BCM_TO_PHYSICAL[bcmPin] || 'Unknown';
}

// Log physical pin mappings on startup for debugging
function logPinMappings() {
  if (boardInfo.type === 'raspberry-pi') {
    console.log("\n=== Raspberry Pi GPIO Pin Mappings (BCM → Physical) ===");
    console.log(`Fan Control: BCM ${PINS.FAN_CONTROL} → Physical Pin ${getPhysicalPinNumber(PINS.FAN_CONTROL)}`);
    console.log(`Solenoid Valve: BCM ${PINS.SOLENOID_VALVE} → Physical Pin ${getPhysicalPinNumber(PINS.SOLENOID_VALVE)}`);
    console.log("Heating Elements:");
    PINS.HEATING_ELEMENTS.forEach((pin, index) => {
      console.log(`  Element ${index+1}: BCM ${pin} → Physical Pin ${getPhysicalPinNumber(pin)}`);
    });
    console.log(`Temperature Probe: BCM ${PINS.TEMP_PROBE} → Physical Pin ${getPhysicalPinNumber(PINS.TEMP_PROBE)} (1-Wire)`);
    console.log("==================================================\n");
  }
}

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

// Helper function to execute GPIO commands via terminal
function executeGpioCommand(command) {
  try {
    execSync(command, { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.error(`GPIO command failed: ${error.message}`);
    return false;
  }
}

// Initialize raspi-gpio for Raspberry Pi
function initializeRaspiGpio() {
  // Check if raspi-gpio is available
  try {
    execSync('which raspi-gpio', { stdio: 'pipe' });
    console.log('Using raspi-gpio for GPIO control');
    return true;
  } catch (error) {
    console.warn('raspi-gpio not found, will try installing it');
    try {
      execSync('sudo apt-get update && sudo apt-get install -y raspi-gpio', { stdio: 'inherit' });
      console.log('raspi-gpio installed successfully');
      return true;
    } catch (installError) {
      console.error('Failed to install raspi-gpio:', installError.message);
      return false;
    }
  }
}

// Try loading different GPIO libraries based on the detected board
function loadGpioLibrary() {
  // For Raspberry Pi, try using raspi-gpio command-line utility first
  if (boardInfo.type === 'raspberry-pi') {
    if (initializeRaspiGpio()) {
      boardInfo.gpioLibrary = 'raspi-gpio-cli';
      return {
        type: 'raspi-gpio-cli',
        Gpio: function(pin, direction) {
          // Initialize the pin
          const mode = direction === 'out' ? 'op' : 'ip';
          executeGpioCommand(`sudo raspi-gpio set ${pin} ${mode}`);
          
          return {
            pin,
            writeSync: function(value) {
              const level = value ? 'dh' : 'dl';
              return executeGpioCommand(`sudo raspi-gpio set ${pin} ${level}`);
            },
            readSync: function() {
              try {
                const output = execSync(`sudo raspi-gpio get ${pin}`, { encoding: 'utf8' });
                // Parse the output to get the pin level
                if (output.includes('level=1')) return 1;
                if (output.includes('level=0')) return 0;
                return -1;
              } catch (error) {
                console.error(`Failed to read GPIO ${pin}:`, error.message);
                return -1;
              }
            },
            unexport: function() {
              // No need to unexport when using raspi-gpio
              return true;
            }
          };
        },
        isSysFsImplementation: false
      };
    }
  }

  // For Orange Pi, try gpio command
  if (boardInfo.type === 'orange-pi') {
    // Check if gpio utility is available (assuming WiringOP is installed)
    try {
      execSync('which gpio', { stdio: 'pipe' });
      console.log('Using gpio command for Orange Pi');
      boardInfo.gpioLibrary = 'gpio-cli';
      
      return {
        type: 'gpio-cli',
        Gpio: function(pin, direction) {
          // Initialize the pin with gpio command
          const mode = direction === 'out' ? 'out' : 'in';
          executeGpioCommand(`sudo gpio mode ${pin} ${mode}`);
          
          return {
            pin,
            writeSync: function(value) {
              return executeGpioCommand(`sudo gpio write ${pin} ${value}`);
            },
            readSync: function() {
              try {
                const output = execSync(`sudo gpio read ${pin}`, { encoding: 'utf8' });
                return parseInt(output.trim()) || 0;
              } catch (error) {
                console.error(`Failed to read GPIO ${pin}:`, error.message);
                return -1;
              }
            },
            unexport: function() {
              // No specific unexport for gpio command
              return true;
            }
          };
        },
        isSysFsImplementation: false
      };
    } catch (error) {
      console.warn('gpio command not found for Orange Pi, trying other methods');
    }
  }

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

  // Fall back to Node.js libraries if CLI tools aren't available
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
  
  // Try our custom sysfs implementation 
  try {
    const sysfsgpio = require('sysfsgpio');
    boardInfo.gpioLibrary = 'sysfsgpio';
    console.log('Using fallback sysfs GPIO implementation');
    return sysfsgpio;
  } catch (error) {
    console.warn('Failed to load sysfsgpio library:', error.message);
  }
  
  // As a last resort, use our internal sysfs implementation
  console.log('No GPIO libraries found, using internal sysfs implementation');
  boardInfo.gpioLibrary = 'sysfs-internal';
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

  // Log pin mappings for easier hardware connections
  logPinMappings();

  try {
    gpio = loadGpioLibrary();
    
    if (!gpio) {
      console.error('Failed to load any GPIO library, running in simulation mode');
      return false;
    }
    
    console.log(`Using GPIO library: ${boardInfo.gpioLibrary}`);
    
    // Initialize outputs based on the library we're using
    if (boardInfo.gpioLibrary === 'raspi-gpio-cli' || boardInfo.gpioLibrary === 'gpio-cli') {
      // Using CLI tools for GPIO control
      fan = gpio.Gpio(PINS.FAN_CONTROL, 'out');
      heatingElements = PINS.HEATING_ELEMENTS.map(pin => gpio.Gpio(pin, 'out'));
      solenoidValve = gpio.Gpio(PINS.SOLENOID_VALVE, 'out');
    }
    else if (boardInfo.gpioLibrary === 'onoff') {
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
    const value = pwmValue > 0 ? 1 : 0;
    
    // Debug output - more verbose for troubleshooting
    console.log(`[GPIO DEBUG] Setting fan GPIO ${PINS.FAN_CONTROL} (Physical pin ${getPhysicalPinNumber(PINS.FAN_CONTROL)}) to ${value}`);
    
    try {
      fan.writeSync(value);
      console.log(`Fan GPIO set successfully to ${value}`);
      
      // Verify the value was set correctly if using sysfs
      if (boardInfo.gpioLibrary === 'sysfs-internal' || boardInfo.gpioLibrary === 'sysfsgpio') {
        const gpioPath = `/sys/class/gpio/gpio${PINS.FAN_CONTROL}/value`;
        if (fs.existsSync(gpioPath)) {
          const readValue = fs.readFileSync(gpioPath, 'utf8').trim();
          console.log(`[GPIO VERIFY] Fan GPIO ${PINS.FAN_CONTROL} actual value: ${readValue}`);
        }
      }
    } catch (error) {
      console.error(`[GPIO ERROR] Failed to set fan GPIO: ${error.message}`);
      
      // Alternative approach - try direct sysfs access
      try {
        const gpioPath = `/sys/class/gpio/gpio${PINS.FAN_CONTROL}/value`;
        if (fs.existsSync(gpioPath)) {
          fs.writeFileSync(gpioPath, value.toString());
          console.log(`[GPIO RECOVER] Set fan GPIO using direct sysfs write`);
        }
      } catch (sysError) {
        console.error(`[GPIO ERROR] Direct sysfs write failed: ${sysError.message}`);
      }
    }
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
    const value = isOn ? 1 : 0;
    console.log(`[GPIO DEBUG] Setting ${heatingElements.length} heating elements to ${value}`);
    
    // Turn all heating elements on or off
    heatingElements.forEach((element, index) => {
      const pin = PINS.HEATING_ELEMENTS[index];
      console.log(`[GPIO DEBUG] Setting heating element ${index+1} GPIO ${pin} (Physical pin ${getPhysicalPinNumber(pin)}) to ${value}`);
      
      try {
        element.writeSync(value);
        console.log(`Heating element ${index+1} GPIO set successfully to ${value}`);
        
        // Verify the value was set
        if (boardInfo.gpioLibrary === 'sysfs-internal' || boardInfo.gpioLibrary === 'sysfsgpio') {
          const gpioPath = `/sys/class/gpio/gpio${pin}/value`;
          if (fs.existsSync(gpioPath)) {
            const readValue = fs.readFileSync(gpioPath, 'utf8').trim();
            console.log(`[GPIO VERIFY] Heating element GPIO ${pin} actual value: ${readValue}`);
          }
        }
      } catch (error) {
        console.error(`[GPIO ERROR] Failed to set heating element GPIO ${pin}: ${error.message}`);
        
        // Alternative approach - try direct sysfs access
        try {
          const gpioPath = `/sys/class/gpio/gpio${pin}/value`;
          if (fs.existsSync(gpioPath)) {
            fs.writeFileSync(gpioPath, value.toString());
            console.log(`[GPIO RECOVER] Set heating element GPIO ${pin} using direct sysfs write`);
          }
        } catch (sysError) {
          console.error(`[GPIO ERROR] Direct sysfs write failed for GPIO ${pin}: ${sysError.message}`);
        }
      }
    });
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
    const value = isOpen ? 1 : 0;
    console.log(`[GPIO DEBUG] Setting solenoid valve GPIO ${PINS.SOLENOID_VALVE} (Physical pin ${getPhysicalPinNumber(PINS.SOLENOID_VALVE)}) to ${value}`);
    
    try {
      solenoidValve.writeSync(value);
      console.log(`Solenoid valve GPIO set successfully to ${value}`);
      
      // Verify the value was set
      if (boardInfo.gpioLibrary === 'sysfs-internal' || boardInfo.gpioLibrary === 'sysfsgpio') {
        const gpioPath = `/sys/class/gpio/gpio${PINS.SOLENOID_VALVE}/value`;
        if (fs.existsSync(gpioPath)) {
          const readValue = fs.readFileSync(gpioPath, 'utf8').trim();
          console.log(`[GPIO VERIFY] Solenoid valve GPIO ${PINS.SOLENOID_VALVE} actual value: ${readValue}`);
        }
      }
    } catch (error) {
      console.error(`[GPIO ERROR] Failed to set solenoid valve GPIO: ${error.message}`);
      
      // Alternative approach - try direct sysfs access
      try {
        const gpioPath = `/sys/class/gpio/gpio${PINS.SOLENOID_VALVE}/value`;
        if (fs.existsSync(gpioPath)) {
          fs.writeFileSync(gpioPath, value.toString());
          console.log(`[GPIO RECOVER] Set solenoid valve GPIO using direct sysfs write`);
        }
      } catch (sysError) {
        console.error(`[GPIO ERROR] Direct sysfs write failed: ${sysError.message}`);
      }
    }
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
  
  // Use a more reliable directory path that works for both regular user and root
  let downloadsFolder;
  
  // Try to create and use user's Downloads folder first
  try {
    downloadsFolder = path.join(os.homedir(), 'Downloads');
    fs.mkdirSync(downloadsFolder, { recursive: true });
  } catch (error) {
    console.log('Could not access user Downloads folder, using /tmp instead');
    downloadsFolder = '/tmp';
  }
  
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
    
    // Fall back to /tmp if initial path failed
    try {
      csvFilePath = path.join('/tmp', `oven_data_${timestamp}.csv`);
      fs.writeFileSync(csvFilePath, header);
      console.log(`Fallback data recording initialized. CSV file: ${csvFilePath}`);
      return true;
    } catch (fallbackError) {
      console.error('Failed to initialize fallback data recording:', fallbackError);
      return false;
    }
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