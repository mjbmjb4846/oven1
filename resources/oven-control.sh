#!/bin/bash
# Launcher script for Oven Control application
# This script handles proper X11 display permissions and environment variables

# Allow X server access from root
xhost +local:root

# Set appropriate environment variables
export DISPLAY=:0
export XAUTHORITY="$HOME/.Xauthority"

# Create Downloads directory if it doesn't exist
mkdir -p "$HOME/Downloads"

# Run the application with needed permissions
sudo /opt/RPi\ Oven\ Control/oven-control --no-sandbox "$@"

# Clean up X server access
xhost -local:root