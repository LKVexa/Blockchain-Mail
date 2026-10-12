@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
call "%~dp0tools\dispatch.cmd" glyphoku
set "RC=%ERRORLEVEL%"
echo.
echo Integration check exit: %RC%
pause
exit /b %RC%
