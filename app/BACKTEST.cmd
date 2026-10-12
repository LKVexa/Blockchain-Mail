@echo off
setlocal EnableExtensions DisableDelayedExpansion
call "%~dp0tools\dispatch.cmd" backtest %*
set "VEXA_EXIT=%ERRORLEVEL%"
echo.
echo Command finished with exit code %VEXA_EXIT%.
pause
exit /b %VEXA_EXIT%
