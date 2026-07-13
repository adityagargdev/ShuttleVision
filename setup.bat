@echo off
REM ShuttleVision Backend Setup
REM Run this once after installing the app to set up the Python backend.
REM Requires Python 3.10+ to be installed (python.org).

echo === ShuttleVision Backend Setup ===
echo.

set SCRIPT_DIR=%~dp0
set VENV_DIR=%SCRIPT_DIR%venv

python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Python not found. Install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

echo Creating virtual environment...
python -m venv "%VENV_DIR%"

echo Installing dependencies (this may take 10-20 minutes)...
"%VENV_DIR%\Scripts\pip" install --upgrade pip
"%VENV_DIR%\Scripts\pip" install torch torchvision --index-url https://download.pytorch.org/whl/cpu
"%VENV_DIR%\Scripts\pip" install ultralytics opencv-python yt-dlp numpy scipy

echo.
echo === Setup complete! ===
echo You can now launch ShuttleVision.
pause
