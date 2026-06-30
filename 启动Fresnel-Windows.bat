@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请先安装 Node.js 18 或更高版本。
  echo 下载地址：https://nodejs.org/
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8788/"
node server.js
pause
