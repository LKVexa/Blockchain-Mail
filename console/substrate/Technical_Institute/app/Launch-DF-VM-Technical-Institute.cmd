@echo off
setlocal EnableExtensions DisableDelayedExpansion
if not defined JA21_PORTABLE_ROOT set "JA21_PORTABLE_ROOT=%~dp0..\portable-runtime"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-DF-VM-Technical-Institute.ps1"
exit /b %errorlevel%
