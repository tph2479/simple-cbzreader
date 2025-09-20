@echo off
call npm install --save-dev electron-builder && call npm install && call npm run dist
pause