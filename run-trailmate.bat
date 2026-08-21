@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title TrailMate

echo ========================================
echo          TrailMate startup script
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed or is not on PATH.
    echo Install Node.js 20 or newer, then run this file again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm is not installed or is not on PATH.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%V in ('node --version') do set NODE_VERSION=%%V
echo Using Node.js %NODE_VERSION%

if not exist "server\.env" (
    echo Creating server\.env from server\.env.example...
    copy /Y "server\.env.example" "server\.env" >nul
    if errorlevel 1 (
        echo ERROR: Could not create server\.env.
        pause
        exit /b 1
    )
)

set "JWT_SECRET="
for /f "delims=" %%S in ('node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"') do set "JWT_SECRET=%%S"

if not defined JWT_SECRET (
    echo ERROR: Could not generate JWT_SECRET.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='server\.env'; $c=Get-Content -Raw $p; $c=[regex]::Replace($c,'(?m)^JWT_SECRET=.*$','JWT_SECRET=%JWT_SECRET%'); Set-Content -Path $p -Value $c -NoNewline"
if errorlevel 1 (
    echo ERROR: Could not update server\.env.
    pause
    exit /b 1
)

echo Installing dependencies...
npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
echo Starting TrailMate...
echo Frontend: http://localhost:5173
echo API:      http://localhost:5000/api/health
echo.
echo Press Ctrl+C to stop the application.
echo.
npm run dev

pause
