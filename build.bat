@echo off
set "URL=https://nodejs.org/dist/v22.19.0/node-v22.19.0-win-x64.zip"
set "DIR=node-v22.19.0-win-x64"
if exist "%DIR%" (echo Node.js already exists at %DIR% && goto :end)
echo Downloading Node.js...
curl -LO "%URL%"
echo Extracting...
tar -xf node-v22.19.0-win-x64.zip
del node-v22.19.0-win-x64.zip
echo Done! Node.js extracted to: %DIR%
:end

call "%DIR%\npm" install --save-dev electron-builder && call "%DIR%\npm" install && call "%DIR%\npm" run dist
@REM pause