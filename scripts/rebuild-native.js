#!/usr/bin/env node

/**
 * This script rebuilds native modules for the current architecture
 * to fix "wrong ELF class" errors when running on Raspberry Pi
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Rebuilding native modules for current architecture...');

// Get the architecture
const arch = process.arch;
console.log(`Detected architecture: ${arch}`);

// Function to safely run a command
function runCommand(cmd) {
  try {
    console.log(`> ${cmd}`);
    const output = execSync(cmd, { stdio: [0, 1, 2] });
    return true;
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    return false;
  }
}

// Clean installation if needed
if (fs.existsSync('node_modules')) {
  console.log('Cleaning previous native modules...');
  
  // Remove problematic native modules
  ['onoff', 'epoll', 'rpio'].forEach(module => {
    const modulePath = path.join('node_modules', module);
    if (fs.existsSync(modulePath)) {
      try {
        console.log(`Removing ${module}...`);
        fs.rmSync(modulePath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to remove ${module}: ${err.message}`);
      }
    }
  });
}

// Install build dependencies
console.log('Installing build dependencies...');
runCommand('sudo apt-get update');
runCommand('sudo apt-get install -y build-essential python3');

// Install Raspberry Pi specific dependencies
console.log('Installing Raspberry Pi specific build dependencies...');
runCommand('sudo apt-get install -y pigpio python3-pigpio');

// Rebuild native modules for the specific architecture
console.log('Installing native modules for Raspberry Pi...');
if (arch === 'arm64') {
  // For 64-bit Raspberry Pi (Pi 4, Pi 5)
  runCommand('npm install --no-save --arch=arm64 onoff epoll rpio');
} else if (arch === 'arm') {
  // For 32-bit Raspberry Pi (older models)
  runCommand('npm install --no-save --arch=arm onoff epoll rpio');
} else {
  console.log(`Architecture ${arch} is not directly supported, attempting generic build...`);
  runCommand('npm install --no-save onoff epoll rpio');
}

// Rebuild any other native modules if needed
console.log('Rebuilding all native modules with electron-rebuild...');
runCommand('npm rebuild');

console.log('\nNative module rebuild complete!');
console.log('You should now be able to run the application without "wrong ELF class" errors.');
console.log('If you still encounter GPIO permission issues, please run the install-native-modules.sh script with:');
console.log('sudo /opt/RPi\\ Oven\\ Control/resources/install-native-modules.sh');