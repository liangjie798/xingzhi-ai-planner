@echo off
setlocal
title Xingzhi Backend - Environment Setup and Startup
pushd "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-backend.ps1" %*
set "START_EXIT_CODE=%ERRORLEVEL%"
popd
if not "%XINGZHI_NO_PAUSE%"=="1" pause
exit /b %START_EXIT_CODE%
