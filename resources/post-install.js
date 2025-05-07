
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
  console.log(`  #!/bin/bash
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
`);
}
