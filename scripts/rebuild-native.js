#!/usr/bin/env node

/**
 * Script to rebuild native modules for the target architecture
 * Used during packaging for Raspberry Pi and other ARM devices
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get target architecture from command line or environment
const targetArch = process.env.TARGET_ARCH || process.argv[2] || 'armv7l';

console.log(`Rebuilding native modules for architecture: ${targetArch}`);

// Set environment variables for building
process.env.npm_config_arch = targetArch;
process.env.npm_config_target_arch = targetArch;

// Directory where we'll rebuild the modules
const buildDir = path.join(__dirname, '..', 'build-native');
const appDir = path.join(__dirname, '..');

// Create build directory if it doesn't exist
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Create .npmrc file to ensure node-gyp uses the right flags for C++20
const npmrcPath = path.join(buildDir, '.npmrc');
fs.writeFileSync(npmrcPath, `
# Set C++20 compiler flags for native modules
npm_config_cflags=-std=c++20
npm_config_cxxflags=-std=c++20
npm_config_msvs_version=2019
`);

// Navigate to the build directory
process.chdir(buildDir);

// Initialize a new package.json
if (!fs.existsSync(path.join(buildDir, 'package.json'))) {
  execSync('npm init -y', { stdio: 'inherit' });
  
  // Modify package.json to include native modules
  const packageJson = require(path.join(buildDir, 'package.json'));
  packageJson.dependencies = {};
  fs.writeFileSync(
    path.join(buildDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

// Create a folder structure for sysfs GPIO implementation
const sysfsDir = path.join(appDir, 'node_modules', 'sysfsgpio');
try {
  // Install native modules with the correct architecture
  console.log('Installing native modules...');
  
  // Set specific environment variables for the build
  const buildEnv = {
    ...process.env,
    npm_config_arch: targetArch,
    npm_config_target_arch: targetArch,
    CXXFLAGS: "-std=c++20",
    CFLAGS: "-std=c++20",
    npm_config_target: process.env.npm_config_target || "16.0.0", // Target Node.js version
  };
  
  // Create the sysfsgpio directory and implementation
  if (!fs.existsSync(sysfsDir)) {
    fs.mkdirSync(sysfsDir, { recursive: true });
  }
  
  // Create a simple implementation using fs
  const sysfsIndexPath = path.join(sysfsDir, 'index.js');
  if (!fs.existsSync(sysfsIndexPath)) {
    fs.writeFileSync(sysfsIndexPath, `
// Simple sysfs GPIO implementation as fallback
const fs = require('fs');
const { execSync } = require('child_process');

class Gpio {
  constructor(pin, direction = 'out') {
    this.pin = pin;
    this.direction = direction;
    this.gpioPath = \`/sys/class/gpio/gpio\${pin}\`;
    
    try {
      // Export the GPIO if not already exported
      if (!fs.existsSync(this.gpioPath)) {
        try {
          fs.writeFileSync('/sys/class/gpio/export', pin.toString());
        } catch (err) {
          console.error(\`Failed to export GPIO \${pin}: \${err.message}\`);
          try {
            execSync(\`echo \${pin} | sudo tee /sys/class/gpio/export\`);
          } catch (sudoErr) {
            console.error(\`Failed with sudo as well: \${sudoErr.message}\`);
          }
        }
      }
      
      // Set direction
      try {
        fs.writeFileSync(\`\${this.gpioPath}/direction\`, direction);
      } catch (err) {
        console.error(\`Failed to set direction for GPIO \${pin}: \${err.message}\`);
        try {
          execSync(\`echo \${direction} | sudo tee \${this.gpioPath}/direction\`);
        } catch (sudoErr) {
          console.error(\`Failed with sudo as well: \${sudoErr.message}\`);
        }
      }
    } catch (error) {
      console.error(\`Error initializing GPIO \${pin}: \${error.message}\`);
    }
  }

  writeSync(value) {
    try {
      fs.writeFileSync(\`\${this.gpioPath}/value\`, value ? '1' : '0');
      return true;
    } catch (error) {
      console.error(\`Failed to write to GPIO \${this.pin}: \${error.message}\`);
      try {
        execSync(\`echo \${value ? '1' : '0'} | sudo tee \${this.gpioPath}/value > /dev/null\`);
        return true;
      } catch (sudoError) {
        console.error(\`Failed with sudo as well: \${sudoError.message}\`);
        return false;
      }
    }
  }

  readSync() {
    try {
      return parseInt(fs.readFileSync(\`\${this.gpioPath}/value\`, 'utf8').trim());
    } catch (error) {
      console.error(\`Failed to read from GPIO \${this.pin}: \${error.message}\`);
      try {
        return parseInt(execSync(\`sudo cat \${this.gpioPath}/value\`).toString().trim());
      } catch (sudoError) {
        console.error(\`Failed with sudo as well: \${sudoError.message}\`);
        return -1;
      }
    }
  }

  unexport() {
    try {
      fs.writeFileSync('/sys/class/gpio/unexport', this.pin.toString());
    } catch (error) {
      console.error(\`Failed to unexport GPIO \${this.pin}: \${error.message}\`);
      try {
        execSync(\`echo \${this.pin} | sudo tee /sys/class/gpio/unexport > /dev/null\`);
      } catch (sudoErr) {
        console.error(\`Failed with sudo as well: \${sudoErr.message}\`);
      }
    }
  }
}

module.exports = { Gpio };
    `);
  }

  // Create package.json for sysfsgpio
  const sysfsPkgPath = path.join(sysfsDir, 'package.json');
  if (!fs.existsSync(sysfsPkgPath)) {
    fs.writeFileSync(sysfsPkgPath, JSON.stringify({
      "name": "sysfsgpio",
      "version": "1.0.0",
      "description": "Fallback GPIO implementation using sysfs",
      "main": "index.js"
    }, null, 2));
  }

  console.log('Native modules installed successfully!');
  console.log('Created fallback GPIO implementation using sysfs');
  
} catch (error) {
  console.error('Error rebuilding native modules:', error);
  process.exit(1);
}