@echo off
rem ============================================================
rem  Doon Right-Light - one-click setup, update and start (Windows)
rem  Double-click this file. It downloads or updates the project,
rem  installs what it needs, and opens the site in your browser.
rem  Close this window to stop the site.
rem ============================================================
setlocal
title Doon Right-Light
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 goto :nogit
where python >nul 2>nul
if errorlevel 1 goto :nopython
where npm >nul 2>nul
if errorlevel 1 goto :nonode

rem --- find or download the project ---
if exist "%~dp0backend\app\main.py" goto :inrepo
if exist "%~dp0Doon-Right-Light\.git" goto :haveclone
echo [1/6] Downloading the project from GitHub...
git clone https://github.com/Arnavkhanna2520/Doon-Right-Light.git
if errorlevel 1 goto :failed
cd /d "%~dp0Doon-Right-Light"
goto :setup

:haveclone
cd /d "%~dp0Doon-Right-Light"
goto :update

:inrepo
cd /d "%~dp0"

:update
echo [1/6] Getting the latest version...
git pull --ff-only
if errorlevel 1 echo    Could not update automatically. Continuing with the version on this computer.

:setup
set "ROOT=%CD%"
cd /d "%ROOT%\backend"
echo [2/6] Preparing Python...
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if errorlevel 1 goto :failed
call ".venv\Scripts\activate.bat"
python -m pip install --quiet --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto :failed

echo [3/6] Preparing the database...
python -m alembic upgrade head
if errorlevel 1 goto :failed

if exist "data\.setup-done" goto :refresh
echo.
echo  First run: create your administrator account.
echo  The password needs 10 or more characters, a capital letter and a digit.
echo  Nothing appears on screen while you type the password. That is normal.
echo.
set /p ADMIN_EMAIL= Your email address: 
python -m app.cli create-admin "%ADMIN_EMAIL%"
if errorlevel 1 echo    Admin account was not created. You can run this file again to retry.
if errorlevel 1 goto :demo
echo done> "data\.setup-done"
:demo
echo [4/6] Loading demo data...
python -m app.cli seed-demo
goto :web

:refresh
echo [4/6] Refreshing demo data (only if it is loaded)...
python -m app.cli seed-demo --if-present

:web
echo [5/6] Building the website (the first time takes a few minutes)...
cd /d "%ROOT%\frontend"
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto :failed
call npm run build
if errorlevel 1 goto :failed

echo [6/6] Starting. Your browser will open http://localhost:8000
echo.
echo  Keep this window open while you use the site. Close it to stop.
echo.
cd /d "%ROOT%\backend"
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:8000"
python -m uvicorn app.main:app --port 8000
goto :end

:nogit
echo Git is not installed. Install it from https://git-scm.com/downloads then run this file again.
goto :pause
:nopython
echo Python is not installed. Install it from https://www.python.org/downloads/ (tick "Add Python to PATH") then run this file again.
goto :pause
:nonode
echo Node.js is not installed. Install it from https://nodejs.org then run this file again.
goto :pause
:failed
echo.
echo Something went wrong in the step above. Copy the red or last few lines and send them to get help.
:pause
echo.
pause
:end
endlocal
