/**
 * This script prepares a deployable folder for Raspberry Pi without requiring 
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

// Output directory for Pi deployment
const outputDir = path.join(__dirname, '..', 'dist', 'pi-deploy');

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

// Copy Pi-specific package.json
const piPackageJson = path.join(__dirname, '..', 'resources', 'package.pi.json');
const destPackageJson = path.join(outputDir, 'package.json');

if (fs.existsSync(piPackageJson)) {
  fs.copyFileSync(piPackageJson, destPackageJson);
  console.log('Copied Pi-specific package.json');
} else {
  console.warn('Warning: Pi-specific package.json not found');
}

// Create a README in the output directory
const readmePath = path.join(outputDir, 'README.md');
fs.writeFileSync(readmePath, `# Oven Control for Raspberry Pi

This is a packaged version of the Oven Control application ready for deployment on Raspberry Pi.

## Installation

1. Transfer this entire folder to your Raspberry Pi
2. Install the required dependencies:
   \`\`\`bash
   npm install
   \`\`\`
3. Start the application:
   \`\`\`bash
   electron .
   \`\`\`

See the \`resources/DEPLOY.md\` file for detailed instructions.
`);

console.log('Created deployment README');

// Create a deployment ZIP file
try {
  const deployZipPath = path.join(__dirname, '..', 'dist', 'oven-control-pi-deploy.zip');
  
  // Check for previous zip and remove
  if (fs.existsSync(deployZipPath)) {
    fs.unlinkSync(deployZipPath);
  }
  
  // Use built-in Node.js zip capability
  console.log('Creating deployment ZIP file...');
  
  // Note: Using JSZip or Archiver would be better but requires additional dependencies
  // This is a simple approach that works with built-in modules only
  
  // Windows-specific approach using PowerShell
  const command = `powershell -command "Compress-Archive -Path '${outputDir}\\*' -DestinationPath '${deployZipPath}'"`;
  execSync(command);
  
  console.log(`Deployment ZIP created: ${deployZipPath}`);
} catch (error) {
  console.error('Failed to create ZIP file:', error.message);
  console.log('Please manually zip the contents of the pi-deploy folder');
}

console.log('\nPreparation complete!');
console.log(`Your Raspberry Pi deployment package is ready at: ${outputDir}`);
console.log('Transfer the entire folder or the zip file to your Raspberry Pi and follow the installation instructions in the README.md file');