@echo off
chcp 65001 > nul
title DualLingua Subtitle App Launcher

echo ========================================================
echo   Starting DualLingua Subtitle and Highlight App
echo ========================================================
echo.

cd /d "C:\Users\kotya\.gemini\antigravity-ide\scratch\subtitle-highlight-app"

set PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%

set "NPM_CMD="
if exist "C:\Program Files\nodejs\npm.cmd" (
    set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
) else if exist "C:\Program Files (x86)\nodejs\npm.cmd" (
    set "NPM_CMD=C:\Program Files (x86)\nodejs\npm.cmd"
) else (
    for /f "delims=" %%i in ('where npm 2^>nul') do (
        if not defined NPM_CMD set "NPM_CMD=%%i"
    )
)

if not defined NPM_CMD (
    set "NPM_CMD=npm"
)

echo [1/3] Cleaning up existing servers on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
ping 127.0.0.1 -n 2 > nul

echo [2/3] Starting development server...
start "DualLinguaServer" /min "%NPM_CMD%" run dev

echo [3/3] Waiting for server to start...
set /a count=0
:waitloop
ping 127.0.0.1 -n 2 > nul
set /a count+=1
powershell -Command "$ErrorActionPreference='SilentlyContinue'; try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
if %errorlevel%==0 goto :serverready
echo    Waiting... %count%s
if %count% geq 15 goto :timeout
goto :waitloop

:serverready
echo.
echo Ready! Opening browser...
ping 127.0.0.1 -n 2 > nul
start "" "http://localhost:3000/"
echo.
echo ========================================================
echo   App is running at http://localhost:3000/
echo   This window will close automatically.
echo ========================================================
ping 127.0.0.1 -n 4 > nul
exit

:timeout
echo.
echo WARNING: Server did not respond within 15 seconds, but opening browser anyway...
start "" "http://localhost:3000/"
exit
