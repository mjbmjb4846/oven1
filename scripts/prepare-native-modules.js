/**
 * This script prepares native modules for cross-compilation
 * It runs before electron-builder to handle architecture-specific requirements
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get target architecture from environment or command line
const targetArch = process.env.TARGET_ARCH || 
                  (process.argv.includes('--arm64') ? 'arm64' : 
                   process.argv.includes('--armv7l') ? 'armv7l' : 'x64');

console.log(`Preparing for cross-compilation to ${targetArch}...`);

// Handle native modules differently based on target architecture
if (targetArch === 'arm64' || targetArch === 'armv7l') {
  console.log('Setting up ARM native modules...');
  
  // Create placeholder modules for native dependencies
  // These will be replaced on the target device during post-install
  const placeholderModules = [
    { name: 'onoff', target: 'raspberry-pi' },
    { name: 'node-orange-pi-gpio', target: 'orange-pi' },
    { name: 'wiring-op', target: 'orange-pi' },
    { name: 'rpio', target: 'all' }
  ];
  
  // Create script that will run on first start to install native modules
  const installScriptPath = path.join(__dirname, '..', 'resources', 'install-native-modules.sh');
  
  let installScript = `#!/bin/bash
# Auto-generated script to install native modules on target device
# This script detects the board type and installs appropriate modules

echo "Detecting board type..."

# Detect board type
BOARD_TYPE="unknown"

if [ -f "/sys/firmware/devicetree/base/model" ]; then
  MODEL=$(cat /sys/firmware/devicetree/base/model)
  if [[ $MODEL == *"Raspberry Pi"* ]]; then
    BOARD_TYPE="raspberry-pi"
    echo "Detected Raspberry Pi: $MODEL"
  fi
fi

if [ -f "/sys/class/sunxi_info/sys_info" ]; then
  BOARD_TYPE="orange-pi"
  echo "Detected Orange Pi board"
fi

# Install appropriate modules based on board type
echo "Installing native GPIO modules for $BOARD_TYPE..."

cd "$(dirname "$0")/.."

if [ "$BOARD_TYPE" = "raspberry-pi" ]; then
  echo "Installing Raspberry Pi specific modules..."
  npm install --no-save onoff epoll
elif [ "$BOARD_TYPE" = "orange-pi" ]; then
  echo "Installing Orange Pi specific modules..."
  npm install --no-save node-orange-pi-gpio wiring-op
fi

# Install general modules that work on any board
echo "Installing general GPIO modules..."
npm install --no-save rpio

echo "Native module installation complete!"
exit 0
`;
  
  fs.writeFileSync(installScriptPath, installScript, { mode: 0o755 });
  console.log('Created install-native-modules.sh script');
  
  // Create a post-install script for deb/AppImage packages
  const postInstallPath = path.join(__dirname, '..', 'resources', 'post-install.js');
  const postInstallScript = `
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Running post-install script...');

// Path to the native module install script
const installScript = path.join(__dirname, 'install-native-modules.sh');

try {
  // Make sure the script is executable
  fs.chmodSync(installScript, '755');
  
  // Run the install script
  console.log('Installing native modules...');
  execSync(installScript, { stdio: 'inherit' });
} catch (error) {
  console.error('Failed to run native module installation:', error.message);
  console.log('You may need to run the script manually:');
  console.log(\`  ${installScript}\`);
}
`;
  
  fs.writeFileSync(postInstallPath, postInstallScript);
  console.log('Created post-install.js script');
} else {
  console.log('Building for x64, no special preparation needed for native modules');
}

console.log('Native module preparation complete!');