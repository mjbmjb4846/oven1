@echo off
SETLOCAL

echo Building Oven Control application in Docker container...

REM Check if Docker is installed
docker --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Docker is not installed or not in your PATH.
    echo Please install Docker Desktop for Windows and try again.
    exit /b 1
)

REM Process command line arguments
set TARGET=all
if not "%~1"=="" (
    set TARGET=%~1
)

echo Building for target: %TARGET%

REM Build the Docker image
echo Building Docker image...
docker build -t oven-control-builder .

REM Run the container with the current directory mounted
echo Running build process...
docker run --rm -v "%cd%:/app" oven-control-builder %TARGET%

echo.
echo Build process completed.
echo If successful, your built packages can be found in the dist/ directory.
echo.

ENDLOCAL