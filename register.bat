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
echo Registering CBZ file association...
simple-cbzreader.exe register

if %errorLevel% == 0 (
    echo SUCCESS: CBZ, avif file association registered!
    echo You can now right-click .cbz files and select "Open with CBZ Reader"
) else (
    echo ERROR: Failed to register file association
)

echo.
pause