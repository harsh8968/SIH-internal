@echo off
title CrackX - Local Dev Server
cd /d "%~dp0"

REM run.py starts the backend with sys.executable, so the interpreter that
REM launches run.py is the one the backend inherits. It MUST be the 3.11 venv:
REM torch/ultralytics/opencv are installed there, not in the system Python.
REM (numpy<2.0 in requirements.txt has no wheel for Python 3.14, which is why
REM  the venv exists at all.)
set PY=backend\venv\Scripts\python.exe

if not exist "%PY%" (
    echo.
    echo   [ERROR] Backend venv not found at backend\venv
    echo.
    echo   Create it once with:
    echo     py -3.11 -m venv backend\venv
    echo     backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    echo.
    pause
    exit /b 1
)

if not exist "crackx-app\node_modules" (
    echo   node_modules missing - run.py will npm install first, this takes a few minutes.
)

if not exist "crackx-app\.env" (
    echo.
    echo   [WARNING] crackx-app\.env is missing.
    echo   Without EXPO_PUBLIC_API_URL the app silently uses RANDOM mock AI
    echo   results instead of the real YOLO model. See src/config/api.ts:72.
    echo.
)

echo.
echo   Starting CrackX...
echo     App: http://localhost:8081
echo     API: http://localhost:5000
echo.
echo   First load takes ~30s while Metro bundles. Ctrl+C stops both.
echo.

"%PY%" run.py

echo.
echo   Services stopped.
pause
