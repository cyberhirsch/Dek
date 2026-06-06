@echo off
setlocal

cd /d "%~dp0"

echo Starting Dek dev server...
echo.
echo Local URL: http://localhost:5173
echo Press Ctrl+C in this window to stop the server.
echo.

start "" /min cmd /c "timeout /t 3 /nobreak >nul & explorer http://localhost:5173"

npm run dev

if errorlevel 1 (
  echo.
  echo Dev server exited with an error.
  pause
)
