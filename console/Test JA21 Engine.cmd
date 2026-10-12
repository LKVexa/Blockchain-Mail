@echo off
setlocal
call "%~dp0host\portable-env.cmd" || exit /b %ERRORLEVEL%
cd /d "%~dp0"
set PYTHONDONTWRITEBYTECODE=1
where py.exe >nul 2>nul && (py.exe -3 "%~dp0tools\verify_package.py" & exit /b %ERRORLEVEL%)
where python.exe >nul 2>nul && (python.exe "%~dp0tools\verify_package.py" & exit /b %ERRORLEVEL%)
echo Python is not available; running the PowerShell integrity verifier instead.
call "%~dp0Verify JA21 Virtual Browser.cmd"
exit /b %ERRORLEVEL%
