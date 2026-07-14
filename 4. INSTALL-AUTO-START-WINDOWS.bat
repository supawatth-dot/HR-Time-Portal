@echo off
chcp 65001 >nul
echo =============================================================
echo   ⚙️ HR-Time Workshop Attendance Portal - Auto-Start Setup
echo =============================================================
cd /d "%~dp0"

echo This script will configure Windows to automatically start the
echo HR-Time Portal in the background every time Windows boots up
echo or when you log into Windows.
echo.

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS_FILE=%STARTUP_DIR%\HR-Time-Portal-AutoStart.vbs
set BAT_PATH=%~dp01. START-PORTAL-BACKGROUND.bat

echo Creating Background Startup Script in Windows Startup Folder...
echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo WshShell.CurrentDirectory = "%~dp0" >> "%VBS_FILE%"
echo WshShell.Run chr(34) ^& "%BAT_PATH%" ^& chr(34), 0, False >> "%VBS_FILE%"

echo.
echo ✅ Successfully installed Windows Auto-Start!
echo 📁 Startup Shortcut created at: %VBS_FILE%
echo.
echo From now on, whenever you start or restart this computer,
echo HR-Time Portal will automatically start in the background!
echo =============================================================
pause
