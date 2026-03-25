@echo off
echo ========================================
echo Starting Video Processor Service
echo ========================================
echo.

REM Activate virtual environment if exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Check if .env exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please copy .env.example to .env and configure it.
    pause
    exit /b 1
)

echo Starting video processor in 3 seconds...
timeout /t 3

python video_processor.py

pause
