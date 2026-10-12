@echo off
set "TEMP=%~dp0test-work"
set "TMP=%~dp0test-work"
if not exist "%~dp0test-work" mkdir "%~dp0test-work"
"%~dp0runtime\node.exe" --test "%~dp0protection\archive.test.mjs" "%~dp0protection\integration-protected.test.mjs"
exit /b %errorlevel%
