const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class SerialManager {
    constructor() {
        this.port = null;
        this.parser = null;
        this.isConnected = false;
        this.responseCallbacks = new Map();
        this.responseTimeout = 5000; // 5 seconds timeout
        this.commandId = 0;
        this.eventEmitter = require('events');
        this.events = new this.eventEmitter();
        
        // Command constants
        this.COMMANDS = {
            // GPIO Commands
            GPIO_READ: 'GPIO_READ',
            GPIO_WRITE: 'GPIO_WRITE',
            GPIO_SET_MODE: 'GPIO_SET_MODE',
            
            // ADC Commands
            ADC_READ: 'ADC_READ',
            ADC_READ_VOLTAGE: 'ADC_READ_VOLTAGE',
            
            // PWM Commands
            PWM_SET: 'PWM_SET',
            PWM_START: 'PWM_START',
            PWM_STOP: 'PWM_STOP',
            
            // System Commands
            PING: 'PING',
            RESET: 'RESET',
            GET_STATUS: 'GET_STATUS',
            GET_VERSION: 'GET_VERSION',
            
            // Broadcast Commands
            BROADCAST: 'BROADCAST',
            BROADCAST_GPIO: 'BROADCAST_GPIO',
            BROADCAST_ADC: 'BROADCAST_ADC',
            
            // Temperature/Sensor Commands
            READ_TEMPERATURE: 'READ_TEMP',
            READ_PRESSURE: 'READ_PRESSURE',
            READ_HUMIDITY: 'READ_HUMIDITY',
            
            // Device Control Commands
            SET_HEATING: 'SET_HEATING',
            SET_FAN: 'SET_FAN',
            SET_STEAM: 'SET_STEAM',
            SET_SOLENOID: 'SET_SOLENOID'
        };
        
        // Response status codes
        this.STATUS = {
            OK: 'OK',
            ERROR: 'ERROR',
            TIMEOUT: 'TIMEOUT',
            INVALID_COMMAND: 'INVALID_CMD',
            INVALID_PARAMS: 'INVALID_PARAMS',
            DEVICE_BUSY: 'DEVICE_BUSY'
        };
    }

    /**
     * List available serial ports
     * @returns {Promise<Array>} Array of available ports
     */
    async listPorts() {
        try {
            const ports = await SerialPort.list();
            return ports.filter(port => port.vendorId || port.productId);
        } catch (error) {
            console.error('Error listing ports:', error);
            return [];
        }
    }

    /**
     * Connect to a serial port
     * @param {string} portPath - Path to the serial port
     * @param {Object} options - Serial port options
     * @returns {Promise<boolean>} Connection success status
     */
    async connect(portPath, options = {}) {
        const defaultOptions = {
            baudRate: 115200,
            dataBits: 8,
            parity: 'none',
            stopBits: 1,
            autoOpen: false
        };

        const serialOptions = { ...defaultOptions, ...options };

        try {
            this.port = new SerialPort({
                path: portPath,
                ...serialOptions
            });

            this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

            // Set up event handlers
            this.setupEventHandlers();

            // Open the port
            await new Promise((resolve, reject) => {
                this.port.open((error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            this.isConnected = true;
            this.events.emit('connected', portPath);
            
            // Send initial ping to verify communication
            const pingResult = await this.ping();
            if (pingResult.status === this.STATUS.OK) {
                console.log('STM32 communication verified');
            }

            return true;
        } catch (error) {
            console.error('Connection error:', error);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Disconnect from the serial port
     */
    async disconnect() {
        if (this.port && this.isConnected) {
            try {
                await new Promise((resolve) => {
                    this.port.close(() => {
                        resolve();
                    });
                });
                this.isConnected = false;
                this.events.emit('disconnected');
                console.log('Disconnected from serial port');
            } catch (error) {
                console.error('Disconnect error:', error);
            }
        }
    }

    /**
     * Setup event handlers for serial communication
     */
    setupEventHandlers() {
        this.parser.on('data', (data) => {
            this.handleResponse(data.trim());
        });

        this.port.on('error', (error) => {
            console.error('Serial port error:', error);
            this.events.emit('error', error);
            this.isConnected = false;
        });

        this.port.on('close', () => {
            console.log('Serial port closed');
            this.isConnected = false;
            this.events.emit('disconnected');
        });
    }

    /**
     * Handle incoming responses from STM32
     * @param {string} data - Raw response data
     */
    handleResponse(data) {
        try {
            const response = JSON.parse(data);
            const { id, command, status, data: responseData, error } = response;

            // Handle command responses
            if (id && this.responseCallbacks.has(id)) {
                const callback = this.responseCallbacks.get(id);
                this.responseCallbacks.delete(id);
                clearTimeout(callback.timeout);
                
                callback.resolve({
                    status,
                    data: responseData,
                    error,
                    command
                });
            }

            // Emit events for broadcasts or unsolicited data
            this.events.emit('data', response);
            if (command) {
                this.events.emit(`response:${command}`, response);
            }

        } catch (error) {
            console.error('Error parsing response:', error, 'Raw data:', data);
            this.events.emit('parseError', { error, data });
        }
    }

    /**
     * Send a command to the STM32
     * @param {string} command - Command name
     * @param {Object} params - Command parameters
     * @param {number} timeout - Response timeout in ms
     * @returns {Promise<Object>} Command response
     */
    async sendCommand(command, params = {}, timeout = this.responseTimeout) {
        if (!this.isConnected) {
            throw new Error('Not connected to serial device');
        }

        const id = ++this.commandId;
        const message = JSON.stringify({
            id,
            command,
            params
        });

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.responseCallbacks.delete(id);
                reject(new Error(`Command timeout: ${command}`));
            }, timeout);

            this.responseCallbacks.set(id, {
                resolve,
                reject,
                timeout: timeoutId
            });

            this.port.write(message + '\r\n', (error) => {
                if (error) {
                    this.responseCallbacks.delete(id);
                    clearTimeout(timeoutId);
                    reject(error);
                }
            });
        });
    }

    // === GPIO Functions ===

    /**
     * Read GPIO pin state
     * @param {number} pin - GPIO pin number
     * @returns {Promise<Object>} Pin state (0 or 1)
     */
    async readGPIO(pin) {
        return await this.sendCommand(this.COMMANDS.GPIO_READ, { pin });
    }

    /**
     * Write GPIO pin state
     * @param {number} pin - GPIO pin number
     * @param {number} state - Pin state (0 or 1)
     * @returns {Promise<Object>} Operation result
     */
    async writeGPIO(pin, state) {
        return await this.sendCommand(this.COMMANDS.GPIO_WRITE, { pin, state });
    }

    /**
     * Set GPIO pin mode
     * @param {number} pin - GPIO pin number
     * @param {string} mode - Pin mode (INPUT, OUTPUT, INPUT_PULLUP, INPUT_PULLDOWN)
     * @returns {Promise<Object>} Operation result
     */
    async setGPIOMode(pin, mode) {
        return await this.sendCommand(this.COMMANDS.GPIO_SET_MODE, { pin, mode });
    }

    // === ADC Functions ===

    /**
     * Read ADC raw value
     * @param {number} channel - ADC channel number
     * @returns {Promise<Object>} Raw ADC value
     */
    async readADC(channel) {
        return await this.sendCommand(this.COMMANDS.ADC_READ, { channel });
    }

    /**
     * Read ADC voltage
     * @param {number} channel - ADC channel number
     * @param {number} vref - Reference voltage (default 3.3V)
     * @returns {Promise<Object>} Voltage reading
     */
    async readADCVoltage(channel, vref = 3.3) {
        return await this.sendCommand(this.COMMANDS.ADC_READ_VOLTAGE, { channel, vref });
    }

    // === PWM Functions ===

    /**
     * Set PWM duty cycle
     * @param {number} channel - PWM channel
     * @param {number} dutyCycle - Duty cycle percentage (0-100)
     * @returns {Promise<Object>} Operation result
     */
    async setPWM(channel, dutyCycle) {
        return await this.sendCommand(this.COMMANDS.PWM_SET, { channel, dutyCycle });
    }

    /**
     * Start PWM output
     * @param {number} channel - PWM channel
     * @returns {Promise<Object>} Operation result
     */
    async startPWM(channel) {
        return await this.sendCommand(this.COMMANDS.PWM_START, { channel });
    }

    /**
     * Stop PWM output
     * @param {number} channel - PWM channel
     * @returns {Promise<Object>} Operation result
     */
    async stopPWM(channel) {
        return await this.sendCommand(this.COMMANDS.PWM_STOP, { channel });
    }

    // === System Functions ===

    /**
     * Ping the STM32 device
     * @returns {Promise<Object>} Ping response
     */
    async ping() {
        return await this.sendCommand(this.COMMANDS.PING);
    }

    /**
     * Reset the STM32 device
     * @returns {Promise<Object>} Reset confirmation
     */
    async reset() {
        return await this.sendCommand(this.COMMANDS.RESET);
    }

    /**
     * Get device status
     * @returns {Promise<Object>} Device status information
     */
    async getStatus() {
        return await this.sendCommand(this.COMMANDS.GET_STATUS);
    }

    /**
     * Get firmware version
     * @returns {Promise<Object>} Firmware version information
     */
    async getVersion() {
        return await this.sendCommand(this.COMMANDS.GET_VERSION);
    }

    // === Broadcast Functions ===

    /**
     * Broadcast a message to all connected devices
     * @param {string} message - Message to broadcast
     * @param {Object} data - Additional data to include
     * @returns {Promise<Object>} Broadcast result
     */
    async broadcast(message, data = {}) {
        return await this.sendCommand(this.COMMANDS.BROADCAST, { message, data });
    }

    /**
     * Broadcast GPIO state to connected devices
     * @param {number} pin - GPIO pin number
     * @param {number} state - Pin state
     * @returns {Promise<Object>} Broadcast result
     */
    async broadcastGPIO(pin, state) {
        return await this.sendCommand(this.COMMANDS.BROADCAST_GPIO, { pin, state });
    }

    /**
     * Broadcast ADC reading to connected devices
     * @param {number} channel - ADC channel
     * @param {number} value - ADC value
     * @returns {Promise<Object>} Broadcast result
     */
    async broadcastADC(channel, value) {
        return await this.sendCommand(this.COMMANDS.BROADCAST_ADC, { channel, value });
    }

    // === Sensor Functions ===

    /**
     * Read temperature from sensor
     * @param {number} sensor - Sensor ID or channel
     * @returns {Promise<Object>} Temperature reading
     */
    async readTemperature(sensor = 0) {
        return await this.sendCommand(this.COMMANDS.READ_TEMPERATURE, { sensor });
    }

    /**
     * Read pressure from sensor
     * @param {number} sensor - Sensor ID or channel
     * @returns {Promise<Object>} Pressure reading
     */
    async readPressure(sensor = 0) {
        return await this.sendCommand(this.COMMANDS.READ_PRESSURE, { sensor });
    }

    /**
     * Read humidity from sensor
     * @param {number} sensor - Sensor ID or channel
     * @returns {Promise<Object>} Humidity reading
     */
    async readHumidity(sensor = 0) {
        return await this.sendCommand(this.COMMANDS.READ_HUMIDITY, { sensor });
    }

    // === Oven Control Functions ===

    /**
     * Control heating element
     * @param {boolean} enabled - Enable/disable heating
     * @param {number} power - Power level (0-100)
     * @returns {Promise<Object>} Operation result
     */
    async setHeating(enabled, power = 100) {
        return await this.sendCommand(this.COMMANDS.SET_HEATING, { enabled, power });
    }

    /**
     * Control fan
     * @param {boolean} enabled - Enable/disable fan
     * @param {number} speed - Fan speed (0-100)
     * @returns {Promise<Object>} Operation result
     */
    async setFan(enabled, speed = 100) {
        return await this.sendCommand(this.COMMANDS.SET_FAN, { enabled, speed });
    }

    /**
     * Control steam system
     * @param {boolean} enabled - Enable/disable steam
     * @param {number} level - Steam level (0-100)
     * @returns {Promise<Object>} Operation result
     */
    async setSteam(enabled, level = 100) {
        return await this.sendCommand(this.COMMANDS.SET_STEAM, { enabled, level });
    }

    /**
     * Control solenoid valve
     * @param {boolean} enabled - Enable/disable solenoid
     * @returns {Promise<Object>} Operation result
     */
    async setSolenoid(enabled) {
        return await this.sendCommand(this.COMMANDS.SET_SOLENOID, { enabled });
    }

    // === Event Management ===

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event callback
     */
    on(event, callback) {
        this.events.on(event, callback);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event callback
     */
    off(event, callback) {
        this.events.off(event, callback);
    }

    /**
     * Remove all event listeners
     * @param {string} event - Event name (optional)
     */
    removeAllListeners(event) {
        this.events.removeAllListeners(event);
    }

    // === Utility Functions ===

    /**
     * Check if connected to serial device
     * @returns {boolean} Connection status
     */
    isDeviceConnected() {
        return this.isConnected;
    }

    /**
     * Get connection information
     * @returns {Object} Connection details
     */
    getConnectionInfo() {
        if (!this.port) return null;
        
        return {
            path: this.port.path,
            baudRate: this.port.baudRate,
            isOpen: this.port.isOpen,
            isConnected: this.isConnected
        };
    }

    /**
     * Send raw data to serial port
     * @param {string} data - Raw data to send
     * @returns {Promise<void>} Send operation
     */
    async sendRaw(data) {
        if (!this.isConnected) {
            throw new Error('Not connected to serial device');
        }

        return new Promise((resolve, reject) => {
            this.port.write(data, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Clear all pending callbacks
        for (const [id, callback] of this.responseCallbacks) {
            clearTimeout(callback.timeout);
            callback.reject(new Error('Serial manager cleanup'));
        }
        this.responseCallbacks.clear();

        // Remove all event listeners
        this.removeAllListeners();

        // Disconnect from serial port
        await this.disconnect();
    }
}

module.exports = SerialManager;