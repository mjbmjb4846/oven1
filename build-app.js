/**
 * Cross-compilation build script for Oven Control application
 * 
 * Usage:
 *   node build-app.js [target]
 * 
 * Available targets:
 *   --rpi, --pi, --raspberry-pi: Build for Raspberry Pi (64-bit ARM)
 *   --rpi32, --raspberry-pi-32: Build for older Raspberry Pi models (32-bit ARM)
 *   --orangepi, --orange: Build for Orange Pi Zero 3 (64-bit ARM)
 *   --all-arm: Build for all ARM targets
 *   --linux: Build for regular Linux (x64)
 *   --win: Build for Windows
 *   --help: Display help
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);

// Show help if requested
if (args.includes('--help') || args.length === 0) {
  console.log(`
Oven Control Application Build Script
====================================

Usage:
  node build-app.js [target]

Available targets:
  --rpi, --pi, --raspberry-pi   Build for Raspberry Pi 4/5 (64-bit ARM)
  --rpi32, --raspberry-pi-32    Build for older Raspberry Pi models (32-bit ARM)
  --orangepi, --orange          Build for Orange Pi Zero 3 (64-bit ARM)
  --all-arm                     Build for all ARM targets
  --linux                       Build for regular Linux (x64)
  --win                         Build for Windows
  --help                        Display this help

Examples:
  node build-app.js --rpi       Build for Raspberry Pi 4/5
  node build-app.js --orangepi  Build for Orange Pi Zero 3
  node build-app.js --all-arm   Build for all ARM targets
  `);
  process.exit(0);
}

// Determine which targets to build
const buildRaspberryPi64 = args.some(arg => ['--rpi', '--pi', '--raspberry-pi', '--all-arm'].includes(arg));
const buildRaspberryPi32 = args.some(arg => ['--rpi32', '--raspberry-pi-32', '--all-arm'].includes(arg));
const buildOrangePi = args.some(arg => ['--orangepi', '--orange', '--all-arm'].includes(arg));
const buildLinux = args.includes('--linux');
const buildWindows = args.includes('--win');

// Check if any valid target was specified
if (!buildRaspberryPi64 && !buildRaspberryPi32 && !buildOrangePi && !buildLinux && !buildWindows) {
  console.error('Error: No valid target specified. Use --help to see available options.');
  process.exit(1);
}

// Create the dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Execute the builds based on the specified targets
console.log('Starting Oven Control application builds...');

try {
  // Build for Raspberry Pi 64-bit
  if (buildRaspberryPi64) {
    console.log('\n===== Building for Raspberry Pi 4/5 (arm64) =====');
    execSync('npm run build:arm64', { stdio: 'inherit' });
    console.log('✅ Raspberry Pi 4/5 build completed successfully!');
    console.log('   Output: dist/RPi Oven Control-0.1.0-arm64.AppImage');
    console.log('   Output: dist/oven-control_0.1.0_arm64.deb');
  }

  // Build for Raspberry Pi 32-bit
  if (buildRaspberryPi32) {
    console.log('\n===== Building for Raspberry Pi (armv7l) =====');
    execSync('npm run build:arm', { stdio: 'inherit' });
    console.log('✅ Raspberry Pi 32-bit build completed successfully!');
    console.log('   Output: dist/RPi Oven Control-0.1.0-armv7l.AppImage');
    console.log('   Output: dist/oven-control_0.1.0_armv7l.deb');
  }

  // Build for Orange Pi
  if (buildOrangePi) {
    console.log('\n===== Building for Orange Pi Zero 3 =====');
    execSync('npm run build:orangepi', { stdio: 'inherit' });
    console.log('✅ Orange Pi Zero 3 build completed successfully!');
    console.log('   Output: dist/RPi Oven Control-0.1.0-arm64.AppImage');
    console.log('   Output: dist/oven-control_0.1.0_arm64.deb');
  }

  // Build for Linux x64
  if (buildLinux) {
    console.log('\n===== Building for Linux x64 =====');
    execSync('npm run dist:linux', { stdio: 'inherit' });
    console.log('✅ Linux x64 build completed successfully!');
    console.log('   Output: dist/RPi Oven Control-0.1.0.AppImage');
    console.log('   Output: dist/oven-control_0.1.0_amd64.deb');
  }

  // Build for Windows
  if (buildWindows) {
    console.log('\n===== Building for Windows =====');
    execSync('npm run dist:no-sign', { stdio: 'inherit' });
    console.log('✅ Windows build completed successfully!');
    console.log('   Output: dist/RPi Oven Control 0.1.0.exe');
  }

  // Summary
  console.log('\n===== Build Summary =====');
  console.log('All specified builds completed successfully!');
  console.log(`Total targets built: ${[
    buildRaspberryPi64 && 'Raspberry Pi 64-bit',
    buildRaspberryPi32 && 'Raspberry Pi 32-bit',
    buildOrangePi && 'Orange Pi Zero 3',
    buildLinux && 'Linux x64',
    buildWindows && 'Windows'
  ].filter(Boolean).join(', ')}`);
  console.log('\nCompiled applications are available in the dist/ directory.');
  console.log('\nTo install on the target device:');
  console.log('1. For AppImage: Transfer the .AppImage file, make it executable with chmod +x, and run it directly');
  console.log('2. For Debian package: Transfer the .deb file and install with sudo dpkg -i filename.deb');

} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}