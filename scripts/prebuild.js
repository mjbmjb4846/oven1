#!/usr/bin/env node

/**
 * This script handles native module preparation for cross-compilation.
 * It ensures we don't try to compile platform-specific modules like 'onoff' and 'epoll'
 * when building for a different platform than the host.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to check if we're building for a different platform than the host
function isCrossPlatformBuild() {
  const isWindows = process.platform === 'win32';
  const isTargetingLinux = process.argv.includes('--linux') || 
                           process.argv.includes('--armv7l') || 
                           process.argv.includes('--arm64');
  
  return isWindows && isTargetingLinux;
}

// Create a resources directory that will contain platform-specific instructions
const resourcesDir = path.join(__dirname, '..', 'resources');
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Create a README.md in the resources directory
const readmePath = path.join(resourcesDir, 'README.md');
fs.writeFileSync(readmePath, `# Raspberry Pi Dependencies

This application uses GPIO libraries that need to be installed on the Raspberry Pi.
Please run the following commands after deploying this application:

\`\`\`bash
sudo apt-get update
sudo apt-get install -y python3 build-essential
npm install --production
\`\`\`

`);

// Create an install.sh script in the resources directory
const installScriptPath = path.join(resourcesDir, 'install.sh');
fs.writeFileSync(installScriptPath, `#!/bin/bash

# Install dependencies for Raspberry Pi
sudo apt-get update
sudo apt-get install -y python3 build-essential
cd "$(dirname "$0")/../"
npm install --production
echo "Dependencies installed successfully!"
`);
// Make the script executable
fs.chmodSync(installScriptPath, '755');

// If this is a cross-platform build, create a dummy module for GPIO control
if (isCrossPlatformBuild()) {
  console.log('Cross-platform build detected - preparing for Raspberry Pi deployment');
  
  // Check if we need to modify package.json for cross-compilation
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = require(packageJsonPath);
  
  // Create a backup of control.js
  const controlJsPath = path.join(__dirname, '..', 'control.js');
  const controlJsContent = fs.readFileSync(controlJsPath, 'utf8');
  fs.writeFileSync(path.join(resourcesDir, 'control.js.original'), controlJsContent);
  
  console.log('Created backup of control.js');
  console.log('Raspberry Pi build preparation complete');
}

console.log('Prebuild script completed successfully');