#!/bin/bash
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

# Create needed directories
echo "Creating necessary directories..."
mkdir -p "$HOME/Downloads"
sudo mkdir -p /root/Downloads
sudo chmod a+rwx /root/Downloads

# Setup GPIO permissions - this is critical for non-root access
echo "Setting up GPIO permissions..."
if [ "$BOARD_TYPE" = "raspberry-pi" ]; then
  # Create gpio group if it doesn't exist
  if ! getent group gpio > /dev/null; then
    echo "Creating gpio group..."
    sudo groupadd -f gpio
  fi
  
  # Add current user to gpio group
  echo "Adding user to gpio group..."
  sudo usermod -a -G gpio $USER
  
  # Set up udev rules for GPIO access
  if [ ! -f "/etc/udev/rules.d/99-gpio.rules" ]; then
    echo "Creating udev rules for GPIO access..."
    echo 'SUBSYSTEM=="gpio", KERNEL=="gpiochip*", ACTION=="add", PROGRAM="/bin/sh -c '\''chown root:gpio /dev/%k; chmod 0660 /dev/%k'\''"' | sudo tee /etc/udev/rules.d/99-gpio.rules > /dev/null
    echo 'SUBSYSTEM=="gpio", KERNEL=="gpio*", ACTION=="add", PROGRAM="/bin/sh -c '\''chown root:gpio /sys/class/gpio/export /sys/class/gpio/unexport ; chmod 0220 /sys/class/gpio/export /sys/class/gpio/unexport'\''"' | sudo tee -a /etc/udev/rules.d/99-gpio.rules > /dev/null
    echo 'SUBSYSTEM=="gpio", KERNEL=="gpiochip*", ACTION=="add", PROGRAM="/bin/sh -c '\''chown root:gpio /dev/%k; chmod 0660 /dev/%k'\''"' | sudo tee -a /etc/udev/rules.d/99-gpio.rules > /dev/null
    echo 'SUBSYSTEM=="gpio", KERNEL=="gpio*", ACTION=="add", PROGRAM="/bin/sh -c '\''chown root:gpio /sys/class/gpio/gpio$number/active_low /sys/class/gpio/gpio$number/direction /sys/class/gpio/gpio$number/edge /sys/class/gpio/gpio$number/value ; chmod 0660 /sys/class/gpio/gpio$number/active_low /sys/class/gpio/gpio$number/direction /sys/class/gpio/gpio$number/edge /sys/class/gpio/gpio$number/value'\''"' | sudo tee -a /etc/udev/rules.d/99-gpio.rules > /dev/null
    sudo udevadm control --reload-rules
    sudo udevadm trigger
  fi
  
  # Set permissions for existing GPIO exports
  echo "Setting permissions for existing GPIO exports..."
  sudo chmod -R a+rw /sys/class/gpio || echo "Warning: Could not set permissions on /sys/class/gpio"
  sudo chmod -R a+rw /dev/gpiomem 2>/dev/null || echo "Warning: Could not set permissions on /dev/gpiomem"
  
  # Create symlinks to make module loading more flexible
  echo "Creating GPIO device symlinks..."
  sudo ln -sf /sys/class/gpio /dev/gpio 2>/dev/null || echo "Warning: Could not create GPIO symlink"
  
  # Load required kernel modules
  echo "Loading required kernel modules..."
  sudo modprobe -q i2c-dev || echo "Warning: Could not load i2c-dev module"
  sudo modprobe -q spi-bcm2835 || echo "Warning: Could not load spi-bcm2835 module"
  sudo modprobe -q w1-gpio || echo "Warning: Could not load w1-gpio module"
  sudo modprobe -q w1-therm || echo "Warning: Could not load w1-therm module"
elif [ "$BOARD_TYPE" = "orange-pi" ]; then
  # Similar setup for Orange Pi
  if ! getent group gpio > /dev/null; then
    sudo groupadd -f gpio
  fi
  
  sudo usermod -a -G gpio $USER
  
  # Orange Pi specific permissions
  sudo chmod -R a+rw /sys/class/gpio || echo "Warning: Could not set permissions on /sys/class/gpio"
  sudo chmod -R a+rw /dev/gpiomem 2>/dev/null || echo "Warning: Could not set permissions on /dev/gpiomem"
  
  # Load required modules for Orange Pi
  sudo modprobe -q spidev || echo "Warning: Could not load spidev module"
  sudo modprobe -q w1-gpio || echo "Warning: Could not load w1-gpio module"
  sudo modprobe -q w1-therm || echo "Warning: Could not load w1-therm module"
fi

# Install appropriate modules based on board type
echo "Installing native GPIO modules for $BOARD_TYPE..."

cd "$(dirname "$0")/.."

# Make launcher script executable
if [ -f "$(dirname "$0")/oven-control.sh" ]; then
  echo "Setting launcher script as executable..."
  chmod +x "$(dirname "$0")/oven-control.sh"
fi

# Set installation flag to use 32-bit modules on armv7l
if [ "$(uname -m)" = "armv7l" ]; then
  echo "Setting up for ARM 32-bit architecture"
  export npm_config_arch=armv7l
  export npm_config_target_arch=armv7l
elif [ "$(uname -m)" = "aarch64" ]; then
  echo "Setting up for ARM 64-bit architecture"
  export npm_config_arch=arm64
  export npm_config_target_arch=arm64
fi

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

# Add desktop shortcut for launcher script
if [ -d "/usr/share/applications" ]; then
  echo "Creating desktop shortcut..."
  cat > /tmp/oven-control.desktop << EOF
[Desktop Entry]
Name=Oven Control
Comment=Raspberry Pi Oven Control System
Exec=$(dirname "$0")/oven-control.sh
Icon=/opt/RPi Oven Control/resources/icon.png
Terminal=false
Type=Application
Categories=Utility;
EOF
  sudo mv /tmp/oven-control.desktop /usr/share/applications/
fi

echo "Native module installation complete!"

# Inform the user about the need to log out and back in
echo ""
echo "=========================================================================="
echo "IMPORTANT: You need to log out and log back in for the GPIO permissions"
echo "to take effect. Otherwise, you may need to run the application as root."
echo "=========================================================================="
echo ""

exit 0
