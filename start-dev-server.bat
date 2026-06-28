@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\.bin\vite.cmd" (
  echo Installing Dek dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist "%~dp0node_modules\.bin\vite.cmd" (
  echo Vite was not installed correctly.
  pause
  exit /b 1
)

echo Starting Dek dev server...
echo Project: %CD%
echo.
echo Local URL: http://localhost:5173
echo Press Ctrl+C in this window to stop the server.
echo.

start "" /min cmd /c "timeout /t 3 /nobreak >nul & explorer http://localhost:5173"

call "%~dp0node_modules\.bin\vite.cmd" --port 5173 --strictPort

if errorlevel 1 (
  echo.
  echo Dev server exited with an error.
  pause
)
