@echo off
chcp 65001 >nul
echo =============================================================
echo   🔍 HR-Time Workshop Attendance Portal - Status Check
echo =============================================================

set RUNNING=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    if not "%%a"=="" (
        echo ✅ Status: RUNNING (Process ID: %%a)
        set RUNNING=1
    )
)

if "%RUNNING%"=="0" (
    echo ❌ Status: STOPPED (No process listening on Port 3000)
    echo.
    echo 👉 Double-click "1. START-PORTAL-BACKGROUND.bat" to start the server.
) else (
    echo.
    echo 💻 Local Access URL : http://localhost:3000
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
        echo 🌐 Network LAN URL  : http:%%a:3000
    )
)
echo =============================================================
pause
