@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\jsqr\dist\jsQR.js (
  call npm ci --ignore-scripts
  if errorlevel 1 (
    echo Dependency installation failed. Check the network and try again.
    pause
    exit /b 1
  )
)
echo Open http://localhost:3000 in your browser.
echo Keep this window open. Press Ctrl+C to stop GymPassJUST.
call npm start
pause
