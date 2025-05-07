/**
 * This script prepares a deployable folder for Orange Pi Zero 3 without requiring 
 * symlinks or complex build processes that often fail on Windows.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define source files to include
const sourceFiles = [
  'main.js',
  'renderer.js',
  'control.js',
  'interface.html',
  'global.css',
  'package.json'
];

// Define directories to create/copy
const directories = [
  'resources',
  'build'
];

// Output directory for Orange Pi deployment
const outputDir = path.join(__dirname, '..', 'dist', 'orange-deploy');

// Create the output directory structure
console.log('Creating output directory structure...');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy source files
console.log('Copying source files...');
sourceFiles.forEach(file => {
  const sourcePath = path.join(__dirname, '..', file);
  const destPath = path.join(outputDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${file}`);
  } else {
    console.warn(`Warning: ${file} not found`);
  }
});

// Copy directories
console.log('Copying directories...');
directories.forEach(dir => {
  const sourceDir = path.join(__dirname, '..', dir);
  const destDir = path.join(outputDir, dir);
  
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  if (fs.existsSync(sourceDir)) {
    // Function to recursively copy directory
    const copyDir = (src, dest) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    
    copyDir(sourceDir, destDir);
    console.log(`Copied directory ${dir}`);
  } else {
    console.warn(`Warning: Directory ${dir} not found`);
  }
});

// Copy Orange Pi-specific package.json
const orangePackageJson = path.join(__dirname, '..', 'resources', 'package.orangepi.json');
const destPackageJson = path.join(outputDir, 'package.json');

if (fs.existsSync(orangePackageJson)) {
  fs.copyFileSync(orangePackageJson, destPackageJson);
  console.log('Copied Orange Pi-specific package.json');
} else {
  console.warn('Warning: Orange Pi-specific package.json not found');
}

// Create Orange Pi specific setup script
const setupScriptPath = path.join(outputDir, 'setup.sh');
fs.writeFileSync(setupScriptPath, `#!/bin/bash
# Orange Pi Zero 3 setup script for Oven Control application

echo "Installing dependencies for Orange Pi Zero 3..."
# Install required system packages
sudo apt-get update
sudo apt-get install -y build-essential python3 python3-dev

# Install Node.js dependencies
npm install

# Set appropriate permissions for GPIO access
sudo usermod -a -G gpio $USER
sudo chmod -R a+rw /sys/class/gpio

echo "Loading required kernel modules..."
# Load any required kernel modules for the Orange Pi Zero 3
sudo modprobe spidev
sudo modprobe w1-gpio
sudo modprobe w1-therm

echo "Setting up system services..."
# Create a systemd service for auto-start if needed
if [ "$1" == "--service" ]; then
  sudo tee /etc/systemd/system/oven-control.service > /dev/null << 'EOF'
[Unit]
Description=Oven Control Application
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which electron) .
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable oven-control.service
  echo "Systemd service installed. Use 'sudo systemctl start oven-control' to start it."
fi

echo "Setup complete! Run 'electron .' to start the application."
`);
fs.chmodSync(setupScriptPath, '755');
console.log('Created Orange Pi setup script');

// Create a README in the output directory
const readmePath = path.join(outputDir, 'README.md');
fs.writeFileSync(readmePath, `# Oven Control for Orange Pi Zero 3

This is a packaged version of the Oven Control application ready for deployment on Orange Pi Zero 3.

## Installation

1. Transfer this entire folder to your Orange Pi Zero 3
2. Run the setup script to install dependencies:
   \`\`\`bash
   chmod +x setup.sh  # Make sure it's executable
   ./setup.sh
   \`\`\`
   
   If you want to install it as a system service:
   \`\`\`bash
   ./setup.sh --service
   \`\`\`

3. Start the application:
   \`\`\`bash
   electron .
   \`\`\`

## GPIO Connections

Make sure your hardware is correctly connected to these GPIO pins:

- Fan Control: GPIO 7 (PC07)
- Heating Elements: GPIO 8, 9, 10 (PC08, PC09, PC10)
- Solenoid Valve: GPIO 6 (PC06)
- Temperature Probe: GPIO 3 (PC03)

## Troubleshooting

If you encounter issues:

1. Check the console for error messages
2. Verify GPIO permissions: \`sudo usermod -a -G gpio $USER\`
3. Make sure the required kernel modules are loaded: \`lsmod | grep -E 'spidev|w1_gpio|w1_therm'\`
4. Check your hardware connections

For more detailed instructions, see the Orange Pi Zero 3 wiring documentation.
`);

console.log('Created deployment README');

// Create a deployment ZIP file
try {
  const deployZipPath = path.join(__dirname, '..', 'dist', 'oven-control-orange-deploy.zip');
  
  // Check for previous zip and remove
  if (fs.existsSync(deployZipPath)) {
    fs.unlinkSync(deployZipPath);
  }
  
  // Use built-in Node.js zip capability
  console.log('Creating deployment ZIP file...');
  
  // Windows-specific approach using PowerShell
  const command = `powershell -command "Compress-Archive -Path '${outputDir}\\*' -DestinationPath '${deployZipPath}'"`;
  execSync(command);
  
  console.log(`Deployment ZIP created: ${deployZipPath}`);
} catch (error) {
  console.error('Failed to create ZIP file:', error.message);
  console.log('Please manually zip the contents of the orange-deploy folder');
}

console.log('\nPreparation complete!');
console.log(`Your Orange Pi Zero 3 deployment package is ready at: ${outputDir}`);
console.log('Transfer the entire folder or the zip file to your Orange Pi and follow the installation instructions in the README.md file');