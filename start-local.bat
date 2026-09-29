@echo off
setlocal
title DineIQ - Local Launcher
cd /d "%~dp0"

echo ============================================
echo   DineIQ - starting backend and frontend
echo   (SQL Server must already be running)
echo ============================================
echo.

where python >nul 2>nul || (echo [X] Python not found. Install Python 3 and run this file again. & pause & exit /b 1)
where npm >nul 2>nul || (echo [X] Node.js / npm not found. Install Node.js and run this file again. & pause & exit /b 1)

if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
  echo [!] backend\.env was missing, so it was created from .env.example.
  echo     Set DB_PASSWORD and JWT_SECRET_KEY in the file that opens, save it,
  echo     then run this file again.
  notepad "backend\.env"
  pause
  exit /b 1
)

if not exist "backend\.venv\Scripts\python.exe" (
  echo [1/2] Creating the Python environment and installing backend packages...
  python -m venv "backend\.venv" || (echo [X] Could not create the Python environment. & pause & exit /b 1)
  "backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt" || (echo [X] Backend package install failed. & pause & exit /b 1)
)

if not exist "frontend\node_modules\@react-three\fiber" (
  echo [2/2] Installing frontend packages...
  pushd frontend
  call npm install || (popd & echo [X] Frontend package install failed. & pause & exit /b 1)
  popd
)

if exist "frontend\.env.local" (
  echo [!] frontend\.env.local exists: the frontend will call the API URL inside it,
  echo     not your local backend. Delete that file to use the local backend.
  echo.
)

start "DineIQ Backend" /d "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --reload"
start "DineIQ Frontend" /d "%~dp0frontend" cmd /k "npm run dev"

echo Waiting for the servers to start...
timeout /t 12 /nobreak >nul
start "" http://localhost:5173

echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:8000/docs
echo   Demo login: admin@dineiq.demo / Demo@12345
echo.
echo To stop DineIQ, close the "DineIQ Backend" and "DineIQ Frontend" windows.
pause
