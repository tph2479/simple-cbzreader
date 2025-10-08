@echo off
setlocal enabledelayedexpansion

where npm >nul 2>&1 && goto :install

if exist ".\node\npm.cmd" goto :install

echo Downloading Node.js...
for /f "usebackq delims=" %%F in (`powershell -NoProfile -Command "(Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest/' -UseBasicParsing).Links | Where-Object { $_.href -match 'node-v.*-win-x64.zip' } | Select-Object -First 1 -ExpandProperty href"`) do set "FILENAME=%%F"

if not defined FILENAME (
    echo ERROR: Unable to detect Node.js download filename.
    exit /b 1
)

set "FILENAME=!FILENAME:/dist/latest/=!"
set "URL=https://nodejs.org/dist/latest/!FILENAME!"

echo Downloading: !URL!

:: Download file
powershell -NoProfile -Command "Invoke-WebRequest -Uri '!URL!' -OutFile '!FILENAME!' -UseBasicParsing"

if not exist "!FILENAME!" (
    echo ERROR: Download failed.
    exit /b 1
)

echo Extracting Node.js...
powershell -NoProfile -Command "Expand-Archive -Path '!FILENAME!' -DestinationPath '.' -Force"

:: Rename extracted folder to 'node'
for /f "delims=" %%D in ('dir /b /ad node-v*-win-x64 2^>nul') do (
    if exist "node" rd /s /q "node"
    ren "%%D" "node"
)

echo Cleaning up...
del "!FILENAME!"

:install
set "PATH=%CD%\node;%PATH%"

if exist ".\node\npm.cmd" (
    echo Using local Node.js installation...
    call ".\node\npm.cmd" install --save-dev electron-builder
    call ".\node\npm.cmd" install
    call ".\node\npm.cmd" run dist
) else (
    echo Using system npm...
    call npm install --save-dev electron-builder
    call npm install
    call npm run dist
)

echo Done!