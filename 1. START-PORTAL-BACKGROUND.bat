@echo off
chcp 65001 >nul
echo =============================================================
echo   🚀 HR-Time Workshop Attendance Portal - Starting Background
echo =============================================================
cd /d "%~dp0"

echo [1/2] Checking if server is already running on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    if not "%%a"=="" (
        echo ⚠️ Server is already running (PID: %%a).
        echo 🌐 Portal URL: http://localhost:3000
        echo =============================================================
        pause
        exit /b
    )
)

echo [2/2] Launching Node.js Server in Background (Hidden Window)...
powershell -WindowStyle Hidden -Command "Start-Process node -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"

timeout /t 2 /nobreak >nul
echo.
echo ✅ HR-Time Portal is now running in the background 24/7!
echo.
echo 💻 Local Access  : http://localhost:3000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    echo 🌐 Network (LAN) : http:%%a:3000
)
echo =============================================================
echo You can close this window now. The portal will continue running.
pause
