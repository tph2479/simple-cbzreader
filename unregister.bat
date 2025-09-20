@echo off
cd /d "%~dp0"

:: Check if running as admin
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running as Administrator...
    goto :run
)

:: Request admin privileges
echo Requesting Administrator privileges...
powershell -Command "Start-Process '%~f0' -Verb RunAs"
exit

:run
echo Unregistering CBZ file association...
simple-cbzreader.exe unregister

if %errorLevel% == 0 (
    echo.
    echo SUCCESS: CBZ Reader removed from context menu!
) else (
    echo.
    echo ERROR: Failed to unregister
)

echo.
pause