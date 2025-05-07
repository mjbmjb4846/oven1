# Oven Control App Deployment Guide

This guide explains how to build the Oven Control application for Raspberry Pi and Orange Pi devices using an x86 Linux machine or Docker.

## Build Options

### Option 1: Building on Linux (Recommended)

If you have access to an x86 Linux machine:

1. Transfer your project to the Linux machine
2. Make the build script executable:
   ```bash
   chmod +x scripts/build-linux.sh
   ```
3. Run the build script for your desired target:
   ```bash
   # For Raspberry Pi 4/5 (64-bit ARM)
   ./scripts/build-linux.sh rpi
   
   # For older Raspberry Pi models (32-bit ARM)
   ./scripts/build-linux.sh rpi32
   
   # For Orange Pi Zero 3
   ./scripts/build-linux.sh orangepi
   
   # For all targets
   ./scripts/build-linux.sh all
   ```

### Option 2: Building with Docker on Windows

If you don't have access to a Linux machine, you can use Docker on your Windows machine:

1. Install Docker Desktop for Windows if you haven't already
2. Run the provided batch file for your desired target:
   ```batch
   build-docker.bat rpi     REM For Raspberry Pi 4/5
   build-docker.bat rpi32   REM For older Raspberry Pi models
   build-docker.bat orangepi REM For Orange Pi Zero 3
   build-docker.bat all     REM For all targets
   ```

## Deployment Instructions

After building, you'll find the compiled packages in the `dist/` directory:

### For Raspberry Pi:
- `dist/RPi Oven Control-0.1.0-arm64.deb` (for Raspberry Pi 4/5)
- `dist/RPi Oven Control-0.1.0-armv7l.deb` (for older Raspberry Pi models)

### For Orange Pi Zero 3:
- `dist/RPi Oven Control-0.1.0-arm64.deb`

### Deploying to your device:

1. **Transfer the .deb file** to your Pi device using one of these methods:
   - SCP: `scp "dist/RPi Oven Control-0.1.0-arm64.deb" pi@your-pi-ip:~/`
   - USB drive
   - Direct download on the Pi

2. **Install the package** on your Pi:
   ```bash
   sudo dpkg -i "RPi Oven Control-0.1.0-arm64.deb"
   ```

   If you encounter dependency errors, run:
   ```bash
   sudo apt-get -f install
   ```

3. **Launch the application**:
   ```bash
   oven-control
   ```

   Or find it in your application menu.

## GPIO Setup

### Raspberry Pi

1. Enable required interfaces:
   ```bash
   sudo raspi-config
   ```
   - Navigate to "Interfacing Options"
   - Enable "1-Wire" (for temperature sensor)
   - Enable "SPI" (if using SPI devices)
   - Enable "I2C" (if using I2C devices)

2. Add your user to the GPIO group:
   ```bash
   sudo usermod -a -G gpio $USER
   ```

3. Set GPIO permissions:
   ```bash
   sudo chmod -R a+rw /sys/class/gpio
   ```

4. Reboot the Pi:
   ```bash
   sudo reboot
   ```

### Orange Pi Zero 3

1. Enable 1-Wire interface (for temperature sensor):
   ```bash
   echo "dtoverlay=w1-gpio" | sudo tee -a /boot/config.txt
   sudo modprobe w1-gpio
   sudo modprobe w1-therm
   ```

2. Set GPIO permissions:
   ```bash
   sudo usermod -a -G gpio $USER
   sudo chmod -R a+rw /sys/class/gpio
   ```

3. Reboot the Orange Pi:
   ```bash
   sudo reboot
   ```

## GPIO Pin Mapping

### Raspberry Pi 4/5:
- Fan Control: GPIO 17
- Heating Elements: GPIO 22, 23, 24
- Solenoid Valve: GPIO 18
- Temperature Probe: GPIO 4

### Orange Pi Zero 3:
- Fan Control: GPIO 7 (PC07)
- Heating Elements: GPIO 8, 9, 10 (PC08, PC09, PC10)
- Solenoid Valve: GPIO 6 (PC06)
- Temperature Probe: GPIO 3 (PC03)

## Troubleshooting

### Native Module Issues

If you encounter issues with native GPIO modules:

1. Run the included installation script manually:
   ```bash
   /opt/RPi\ Oven\ Control/resources/install-native-modules.sh
   ```

2. Check for errors in the installation process.

### Permission Issues

If you encounter permission errors when accessing GPIO:

```bash
sudo chmod -R a+rw /sys/class/gpio
sudo usermod -a -G gpio $USER
sudo reboot
```

### Display/Graphics Issues

If the application starts but the UI doesn't display correctly:

1. Make sure you have the latest graphics drivers:
   ```bash
   sudo apt-get update
   sudo apt-get upgrade
   ```

2. Ensure you have the required X11 libraries:
   ```bash
   sudo apt-get install -y libgtk-3-0 libx11-xcb1 libxcb-dri3-0 libxss1
   ```

### Logs and Debugging

Application logs can be found at:
```bash
~/.config/RPi\ Oven\ Control/logs/
```

For additional debugging, run:
```bash
oven-control --enable-logging
```