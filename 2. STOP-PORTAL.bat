@echo off
chcp 65001 >nul
echo =============================================================
echo   🛑 HR-Time Workshop Attendance Portal - Stop Server
echo =============================================================
cd /d "%~dp0"

echo Finding Node.js process listening on Port 3000...
set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    if not "%%a"=="" (
        echo Stopping Server PID: %%a ...
        taskkill /F /PID %%a >nul 2>&1
        set FOUND=1
    )
)

if "%FOUND%"=="1" (
    echo.
    echo ✅ HR-Time Portal server has been stopped successfully.
) else (
    echo.
    echo ℹ️ No server running on Port 3000 was found.
)
echo =============================================================
pause
