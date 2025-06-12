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
    PRESSURE_SENSOR: 25,   // BCM 25 = Physical Pin 22 - New input pin for pressure sensor
    TEMP_PROBE: 4          // BCM 4 = Physical Pin 7 (for DS18B20 1-Wire)
  },
  'orange-pi': {
    // Orange Pi Zero 3 pin mapping (adjusted for H618 SoC)
    FAN_CONTROL: 7,  // PC07
    HEATING_ELEMENTS: [8, 9, 10], // PC08, PC09, PC10
    SOLENOID_VALVE: 6, // PC06
    PRESSURE_SENSOR: 11, // PC11 - New input pin for pressure sensor
    TEMP_PROBE: 3   // PC03
  },
  'generic-arm': {
    // Generic fallback using lower pin numbers that are likely available
    FAN_CONTROL: 17,
    HEATING_ELEMENTS: [22, 23, 24],
    SOLENOID_VALVE: 18,
    PRESSURE_SENSOR: 25,
    TEMP_PROBE: 4
  },
  'unknown': {
    // Simulation mode - pin values don't matter
    FAN_CONTROL: 17,
    HEATING_ELEMENTS: [22, 23, 24],
    SOLENOID_VALVE: 18,
    PRESSURE_SENSOR: 25,
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
  25: 22, // Pressure sensor
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
      
      // Initialize pressure sensor as input
      if (PINS.PRESSURE_SENSOR) {
        console.log(`Setting up pressure sensor on GPIO ${PINS.PRESSURE_SENSOR} (Physical pin ${getPhysicalPinNumber(PINS.PRESSURE_SENSOR)})`);
        
        // For terminal-based GPIO, we need to set up the pin as input
        if (boardInfo.gpioLibrary === 'raspi-gpio-cli') {
          executeGpioCommand(`sudo raspi-gpio set ${PINS.PRESSURE_SENSOR} ip`);
          executeGpioCommand(`sudo raspi-gpio set ${PINS.PRESSURE_SENSOR} pu`); // Enable pull-up resistor
        } else if (boardInfo.gpioLibrary === 'gpio-cli') {
          executeGpioCommand(`sudo gpio mode ${PINS.PRESSURE_SENSOR} in`);
          executeGpioCommand(`sudo gpio mode ${PINS.PRESSURE_SENSOR} up`); // Enable pull-up resistor
        }
        
        pressureSensor = gpio.Gpio(PINS.PRESSURE_SENSOR, 'in');
      }
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
    try {
      // First try to use the initialized pressure sensor pin if available
      if (pressureSensor) {
        console.log(`[GPIO DEBUG] Reading pressure sensor on GPIO ${PINS.PRESSURE_SENSOR}`);
        
        let value = -1;
        
        // First attempt: use our GPIO object's readSync method
        try {
          value = pressureSensor.readSync();
          console.log(`[GPIO INFO] Pressure sensor raw value: ${value}`);
        } catch (err) {
          console.error(`[GPIO ERROR] Failed to read pressure sensor using object method: ${err.message}`);
          value = -1;
        }
        
        // Second attempt: Try terminal command if the first attempt failed
        if (value === -1) {
          try {
            if (boardInfo.gpioLibrary === 'raspi-gpio-cli') {
              const output = execSync(`sudo raspi-gpio get ${PINS.PRESSURE_SENSOR}`, { encoding: 'utf8' });
              if (output.includes('level=1')) value = 1;
              else if (output.includes('level=0')) value = 0;
              console.log(`[GPIO INFO] Pressure sensor terminal read value: ${value}`);
            } 
            else if (boardInfo.gpioLibrary === 'gpio-cli') {
              const output = execSync(`sudo gpio read ${PINS.PRESSURE_SENSOR}`, { encoding: 'utf8' });
              value = parseInt(output.trim()) || 0;
              console.log(`[GPIO INFO] Pressure sensor terminal read value: ${value}`);
            }
          } catch (cmdError) {
            console.error(`[GPIO ERROR] Terminal command for pressure reading failed: ${cmdError.message}`);
          }
        }
        
        // Third attempt: Direct sysfs read if everything else failed
        if (value === -1) {
          try {
            const gpioPath = `/sys/class/gpio/gpio${PINS.PRESSURE_SENSOR}/value`;
            if (fs.existsSync(gpioPath)) {
              value = parseInt(fs.readFileSync(gpioPath, 'utf8').trim());
              console.log(`[GPIO INFO] Pressure sensor sysfs read value: ${value}`);
            }
          } catch (sysfsError) {
            console.error(`[GPIO ERROR] Sysfs read failed: ${sysfsError.message}`);
          }
        }
        
        // Convert digital reading to voltage simulation
        // For real analog reading, you'd use an ADC chip
        if (value !== -1) {
          // Create a small variation around base voltages for 0 and 1
          // This simulates analog reading based on a digital pin
          const baseVoltage = value === 0 ? 0.2 : 2.8;  // 0.2V for LOW, 2.8V for HIGH
          const variation = (Math.random() * 0.4) - 0.2; // -0.2V to +0.2V variation
          const voltage = Math.min(3.3, Math.max(0, baseVoltage + variation));
          
          console.log(`[GPIO INFO] Converted pressure reading to ${voltage.toFixed(2)}V`);
          return voltage;
        }
      }
      
      // Try to read from MCP3008 ADC if available
      try {
        if (boardInfo.type === 'raspberry-pi') {
          // Try to read from MCP3008 ADC via SPI using terminal commands
          // This assumes spidev is enabled and mcp3008-util is installed
          try {
            // Check if mcp3008-util is installed
            execSync('which mcp3008-util', { stdio: 'pipe' });
            
            // Read from ADC channel 0
            const output = execSync('sudo mcp3008-util read 0', { encoding: 'utf8' });
            const adcValue = parseInt(output.trim());
            
            // Convert ADC value to voltage (MCP3008 is 10-bit, so 0-1023)
            const voltage = (adcValue / 1023) * 3.3;
            console.log(`MCP3008 ADC reading: ${adcValue} (${voltage.toFixed(2)}V)`);
            return voltage;
          } catch (adcError) {
            console.warn(`MCP3008 ADC reading failed: ${adcError.message}`);
            
            // Try another common ADC tool: adc-mcp3008
            try {
              execSync('which adc-mcp3008', { stdio: 'pipe' });
              const output = execSync('sudo adc-mcp3008 0', { encoding: 'utf8' });
              const adcValue = parseInt(output.trim());
              const voltage = (adcValue / 1023) * 3.3;
              console.log(`adc-mcp3008 reading: ${adcValue} (${voltage.toFixed(2)}V)`);
              return voltage;
            } catch (altAdcError) {
              console.warn(`Alternative ADC reading failed: ${altAdcError.message}`);
            }
          }
        }
      } catch (error) {
        console.warn(`ADC error: ${error.message}`);
      }
      
      // For Orange Pi, use the appropriate ADC method if available
      if (boardInfo.type === 'orange-pi' && boardInfo.gpioLibrary === 'node-orange-pi-gpio' && gpio.readAdc) {
        const adcValue = gpio.readAdc(PINS.PRESSURE_SENSOR);
        // Convert ADC value to voltage (assuming 12-bit ADC with 3.3V reference)
        const voltage = (adcValue / 4095) * 3.3;
        return voltage;
      }
      
      // If all attempts failed, return simulated values
      throw new Error('No pressure sensor reading method available');
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

// Enhanced data recording variables
let csvFilePath = null;
let customStoragePath = null; // Custom folder path for CSV storage
let dataRecordingInterval = null;
let recordingIntervalSeconds = 5;
let sessionStartTime = null;
let lastSystemStartTime = null;
let systemRuntime = 0; // Total cooking time in current session

// System state variables for comprehensive logging
let currentTemp = 25;
let targetTemp = 150;
let fanSpeed = 0;
let steamLevel = 0;
let heatingElementsOn = false;
let solenoidValveOpen = false;
let systemActive = false;
let timerEnabled = false;
let timerActive = false;
let timerRemainingSeconds = 0;
let timerTotalSeconds = 0;

// Initialize CSV data recording with comprehensive headers
function initializeDataRecording() {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  sessionStartTime = new Date();
    // Use custom storage path if available, otherwise use Downloads folder
  let downloadsFolder;
  
  if (customStoragePath && fs.existsSync(customStoragePath)) {
    // Use the custom storage path
    downloadsFolder = customStoragePath;
    console.log(`Using custom storage path: ${customStoragePath}`);
  } else {
    // Try to create and use user's Downloads folder first
    try {
      downloadsFolder = path.join(os.homedir(), 'Downloads');
      fs.mkdirSync(downloadsFolder, { recursive: true });
    } catch (error) {
      console.log('Could not access user Downloads folder, using /tmp instead');
      downloadsFolder = '/tmp';
    }
  }
  
  csvFilePath = path.join(downloadsFolder, `oven_data_${timestamp}.csv`);
  
  try {
    // Get system information
    const osInfo = {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      nodeVersion: process.version
    };
    
    // Create comprehensive CSV header with system and board information
    const header = `# Oven Control System Data Log\n` +
                  `# Session Start: ${sessionStartTime.toISOString()}\n` +
                  `# System: ${osInfo.platform} ${osInfo.arch} ${osInfo.release}\n` +
                  `# Hostname: ${osInfo.hostname}\n` +
                  `# Node.js: ${osInfo.nodeVersion}\n` +
                  `# Board: ${boardInfo.model}\n` +
                  `# GPIO Library: ${boardInfo.gpioLibrary || 'Simulated'}\n` +
                  `# Simulation Mode: ${!isCompatibleBoard}\n` +
                  `# Recording Interval: ${recordingIntervalSeconds}s\n` +
                  `#\n` +
                  'Timestamp,Session_Runtime_s,Cooking_Runtime_s,Current_Temp_C,Target_Temp_C,Pressure_V,' +
                  'Heating_Status,Fan_Speed_Pct,Steam_Status,Steam_Level_Pct,System_Active,' +
                  'Timer_Enabled,Timer_Active,Timer_Remaining_s,Timer_Total_s,' +
                  'Simulation_Mode,OS_Platform,OS_Arch,Board_Type,GPIO_Library\n';
    
    fs.writeFileSync(csvFilePath, header);
    
    console.log(`Enhanced data recording initialized. CSV file: ${csvFilePath}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize data recording:', error);
    
    // Fall back to /tmp if initial path failed
    try {
      csvFilePath = path.join('/tmp', `oven_data_${timestamp}.csv`);
      const fallbackHeader = `# Oven Control System Data Log (Fallback Location)\n` +
                            `# Session Start: ${sessionStartTime.toISOString()}\n` +
                            `# System: ${os.platform()} ${os.arch()}\n` +
                            `# Board: ${boardInfo.model}\n` +
                            `# Simulation Mode: ${!isCompatibleBoard}\n` +
                            `#\n` +
                            'Timestamp,Session_Runtime_s,Cooking_Runtime_s,Current_Temp_C,Target_Temp_C,Pressure_V,' +
                            'Heating_Status,Fan_Speed_Pct,Steam_Status,Steam_Level_Pct,System_Active,' +
                            'Timer_Enabled,Timer_Active,Timer_Remaining_s,Timer_Total_s,' +
                            'Simulation_Mode,OS_Platform,OS_Arch,Board_Type,GPIO_Library\n';
      
      fs.writeFileSync(csvFilePath, fallbackHeader);
      console.log(`Fallback data recording initialized. CSV file: ${csvFilePath}`);
      return true;
    } catch (fallbackError) {
      console.error('Failed to initialize fallback data recording:', fallbackError);
      return false;
    }
  }
}

// Record comprehensive data point to CSV
function recordDataPoint(temperature, pressure, heating, fan, steam, steamLvl, sysActive, timerEn, timerAct, timerRem, timerTot) {
  if (!csvFilePath) return false;
  
  try {
    const now = new Date();
    const timestamp = now.toISOString();
    
    // Calculate session runtime
    const sessionRuntime = sessionStartTime ? Math.floor((now - sessionStartTime) / 1000) : 0;
    
    // Calculate cooking runtime (time since system was last started)
    let cookingRuntime = 0;
    if (lastSystemStartTime && sysActive) {
      cookingRuntime = Math.floor((now - lastSystemStartTime) / 1000);
    }
    
    // Prepare comprehensive data point
    const dataPoint = [
      timestamp,                                    // Timestamp
      sessionRuntime,                              // Session_Runtime_s
      cookingRuntime,                              // Cooking_Runtime_s
      temperature.toFixed(2),                      // Current_Temp_C
      targetTemp.toFixed(2),                       // Target_Temp_C
      pressure.toFixed(3),                         // Pressure_V
      heating ? 'ON' : 'OFF',                      // Heating_Status
      fan.toFixed(1),                              // Fan_Speed_Pct
      steam ? 'ON' : 'OFF',                        // Steam_Status
      steamLvl.toFixed(1),                         // Steam_Level_Pct
      sysActive ? 'ACTIVE' : 'INACTIVE',           // System_Active
      timerEn ? 'ENABLED' : 'DISABLED',            // Timer_Enabled
      timerAct ? 'RUNNING' : 'STOPPED',            // Timer_Active
      timerRem,                                    // Timer_Remaining_s
      timerTot,                                    // Timer_Total_s
      !isCompatibleBoard ? 'SIM' : 'REAL',         // Simulation_Mode
      os.platform(),                               // OS_Platform
      os.arch(),                                   // OS_Arch
      boardInfo.type,                              // Board_Type
      boardInfo.gpioLibrary || 'simulated'         // GPIO_Library
    ].join(',') + '\n';
    
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
    
    // Record comprehensive data point with all system state
    recordDataPoint(
      temperature,           // Current temperature
      pressure,             // Pressure reading
      heatingElementsOn,    // Heating status
      fanSpeed,             // Fan speed percentage
      solenoidValveOpen,    // Steam status
      steamLevel,           // Steam level percentage
      systemActive,         // System active status
      timerEnabled,         // Timer enabled
      timerActive,          // Timer running
      timerRemainingSeconds, // Timer remaining
      timerTotalSeconds     // Timer total duration
    );
    
    if (callback) {
      callback({
        temperature,
        pressure,
        timestamp: new Date().toISOString(),
        heating: heatingElementsOn,
        fan: fanSpeed,
        steam: solenoidValveOpen,
        steamLevel: steamLevel,
        systemActive: systemActive,
        timer: {
          enabled: timerEnabled,
          active: timerActive,
          remaining: timerRemainingSeconds,
          total: timerTotalSeconds
        }
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

// Set custom storage path for CSV files
function setCustomStoragePath(folderPath) {
  if (!folderPath) {
    customStoragePath = null;
    console.log('Custom storage path cleared, using default Downloads folder');
    return;
  }
  
  // Validate the path exists
  if (!fs.existsSync(folderPath)) {
    console.error(`Custom storage path does not exist: ${folderPath}`);
    return false;
  }
  
  // Test write permissions
  try {
    const testFile = path.join(folderPath, '.test_write');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    customStoragePath = folderPath;
    console.log(`Custom storage path set to: ${folderPath}`);
    return true;
  } catch (error) {
    console.error(`Cannot write to custom storage path: ${folderPath}`, error.message);
    return false;
  }
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

// Update current temperature for data recording purposes
function updateCurrentTemperature(temperature) {
  currentTemp = temperature;
}

// Update system state variables for comprehensive logging
function updateSystemState(state) {
  if (state.fanSpeed !== undefined) fanSpeed = state.fanSpeed;
  if (state.steamLevel !== undefined) steamLevel = state.steamLevel;
  if (state.heatingElementsOn !== undefined) heatingElementsOn = state.heatingElementsOn;
  if (state.solenoidValveOpen !== undefined) solenoidValveOpen = state.solenoidValveOpen;
  if (state.systemActive !== undefined) systemActive = state.systemActive;
  if (state.targetTemp !== undefined) targetTemp = state.targetTemp;
  
  // Update system start time tracking
  if (state.systemActive && !lastSystemStartTime) {
    lastSystemStartTime = new Date();
  } else if (!state.systemActive) {
    lastSystemStartTime = null;
  }
}

// Update timer state variables
function updateTimerState(timerState) {
  if (timerState.enabled !== undefined) timerEnabled = timerState.enabled;
  if (timerState.active !== undefined) timerActive = timerState.active;
  if (timerState.remaining !== undefined) timerRemainingSeconds = timerState.remaining;
  if (timerState.total !== undefined) timerTotalSeconds = timerState.total;
}

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
  setCustomStoragePath,
  updateCurrentTemperature,
  updateSystemState,
  updateTimerState,
  systemEvents,
  isCompatibleBoard,
  boardInfo
};