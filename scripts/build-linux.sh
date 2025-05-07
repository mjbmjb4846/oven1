#!/bin/bash
# Build script for cross-compiling on Linux x86 machines

# Check if running on Linux
if [[ "$(uname)" != "Linux" ]]; then
  echo "This script must be run on a Linux machine."
  exit 1
fi

# Parse arguments
TARGET="all"
if [ $# -gt 0 ]; then
  TARGET=$1
fi

# Ensure we have all necessary tools
echo "Checking dependencies..."
command -v npm >/dev/null 2>&1 || { echo "npm is required. Please install Node.js and npm."; exit 1; }
command -v fpm >/dev/null 2>&1 || { 
  echo "fpm (Effing Package Manager) is missing. Installing..."
  sudo apt-get update
  sudo apt-get install -y ruby ruby-dev rubygems build-essential
  sudo gem install --no-document fpm
}

# Prepare the build environment
echo "Installing project dependencies..."
npm install

# Ensure necessary directories exist
mkdir -p dist

echo "Preparing for cross-compilation..."
case $TARGET in
  "rpi" | "raspberry-pi")
    echo "Building for Raspberry Pi 4/5 (arm64)..."
    node scripts/prepare-native-modules.js --arm64
    NODE_OPTIONS=--max_old_space_size=4096 npm run dist:pi-arm64
    ;;
    
  "rpi32" | "raspberry-pi-32")
    echo "Building for older Raspberry Pi models (armv7l)..."
    node scripts/prepare-native-modules.js --armv7l
    NODE_OPTIONS=--max_old_space_size=4096 npm run dist:pi-armv7l
    ;;
    
  "orangepi" | "orange")
    echo "Building for Orange Pi Zero 3 (arm64)..."
    node scripts/prepare-native-modules.js --arm64
    NODE_OPTIONS=--max_old_space_size=4096 npm run dist:orangepi
    ;;
    
  "all")
    echo "Building for all ARM targets..."
    
    echo "Building for Raspberry Pi 4/5 (arm64)..."
    node scripts/prepare-native-modules.js --arm64
    NODE_OPTIONS=--max_old_space_size=4096 npm run dist:pi-arm64
    
    echo "Building for older Raspberry Pi models (armv7l)..."
    node scripts/prepare-native-modules.js --armv7l
    NODE_OPTIONS=--max_old_space_size=4096 npm run dist:pi-armv7l
    
    echo "Building for Orange Pi Zero 3 (arm64)..."
    node scripts/prepare-native-modules.js --arm64
    NODE_OPTIONS=--max_old_space_size=4096 npm run dist:orangepi
    ;;
    
  *)
    echo "Unknown target: $TARGET"
    echo "Valid targets: rpi, rpi32, orangepi, all"
    exit 1
    ;;
esac

echo "Build process complete!"
echo "You can find the output files in the dist/ directory."