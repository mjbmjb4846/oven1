/**
 * This script runs after the application is packaged by electron-builder
 * It copies the native module installation script and launcher script to the right locations
 */

const fs = require('fs');
const path = require('path');

module.exports = async function(context) {
  const { appOutDir, packager, electronPlatformName, arch } = context;
  
  console.log(`AfterPack script running for ${electronPlatformName}-${arch}`);
  
  // Only for Linux builds
  if (electronPlatformName === 'linux') {
    console.log('Setting up post-installation for Linux build...');
    
    // Ensure resources directory exists
    const resourcesDir = path.join(appOutDir, 'resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
    
    // Copy the install-native-modules.sh script to the package
    const sourceScript = path.join(__dirname, 'install-native-modules.sh');
    const targetScript = path.join(resourcesDir, 'install-native-modules.sh');
    
    try {
      // Copy the installation script
      fs.copyFileSync(sourceScript, targetScript);
      
      // Make the script executable
      fs.chmodSync(targetScript, 0o755);
      
      console.log('Native module installation script copied successfully');
    } catch (err) {
      console.error('Error copying native module install script:', err);
    }
    
    // Copy the launcher script to the package
    const sourceLauncher = path.join(__dirname, 'oven-control.sh');
    const targetLauncher = path.join(resourcesDir, 'oven-control.sh');
    
    try {
      // Copy the launcher script
      fs.copyFileSync(sourceLauncher, targetLauncher);
      
      // Make the launcher script executable
      fs.chmodSync(targetLauncher, 0o755);
      
      console.log('Launcher script copied successfully');
    } catch (err) {
      console.error('Error copying launcher script:', err);
    }
    
    // Setup desktop entry in the package
    try {
      // Create desktop entry path
      const desktopEntryDir = path.join(appOutDir, 'usr', 'share', 'applications');
      fs.mkdirSync(desktopEntryDir, { recursive: true });
      
      // Create desktop entry content with launcher script
      const desktopEntryContent = `[Desktop Entry]
Name=Oven Control
Comment=Raspberry Pi Oven Control System
Exec=/opt/RPi\\ Oven\\ Control/resources/oven-control.sh
Icon=/opt/RPi Oven Control/resources/icon.png
Terminal=false
Type=Application
Categories=Utility;
`;
      
      // Write the desktop entry file
      fs.writeFileSync(path.join(desktopEntryDir, 'oven-control.desktop'), desktopEntryContent);
      
      console.log('Desktop entry created successfully');
    } catch (err) {
      console.error('Error creating desktop entry:', err);
    }
  }
};