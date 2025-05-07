/**
 * This script runs after the application is packaged by electron-builder
 * It copies the native module installation script to the right location
 */

const fs = require('fs');
const path = require('path');

module.exports = async function(context) {
  const { appOutDir, packager, electronPlatformName, arch } = context;
  
  console.log(`AfterPack script running for ${electronPlatformName}-${arch}`);
  
  // Only for Linux builds
  if (electronPlatformName === 'linux') {
    console.log('Setting up post-installation for Linux build...');
    
    // Copy the install-native-modules.sh script to the package
    const sourceScript = path.join(__dirname, 'install-native-modules.sh');
    const targetScript = path.join(appOutDir, 'resources', 'install-native-modules.sh');
    
    try {
      // Make sure the destination directory exists
      fs.mkdirSync(path.join(appOutDir, 'resources'), { recursive: true });
      
      // Copy the script
      fs.copyFileSync(sourceScript, targetScript);
      
      // Make the script executable
      fs.chmodSync(targetScript, 0o755);
      
      console.log('Native module installation script copied successfully');
    } catch (err) {
      console.error('Error copying native module install script:', err);
    }
  }
};