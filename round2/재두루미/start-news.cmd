@echo off
cd /d "%~dp0"
echo Starting news collection at http://localhost:4317
echo Open the URL in your browser, then click Refresh.
echo Press Ctrl+C to stop the server.
call npm.cmd start
if errorlevel 1 pause
