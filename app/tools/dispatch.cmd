@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0.."
set "VEXA_NODE="
if exist "%CD%\runtime\win-x64\node.exe" set "VEXA_NODE=%CD%\runtime\win-x64\node.exe"
if not defined VEXA_NODE for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined VEXA_NODE set "VEXA_NODE=%%N"
if not defined VEXA_NODE (
  echo Node.js runtime not found. No download or system change was attempted.
  echo Run SETUP_RUNTIME.cmd explicitly for the optional private runtime,
  echo or provide Node.js 24.19 or newer with node:sqlite.
  exit /b 2
)
"%VEXA_NODE%" "%CD%\tools\preflight.mjs"
if errorlevel 1 exit /b 2
if /i "%~1"=="serve" goto vexa_serve
if /i "%~1"=="test" goto vexa_test
if /i "%~1"=="demo" goto vexa_demo
if /i "%~1"=="backtest" goto vexa_backtest
if /i "%~1"=="glyphoku" goto vexa_glyphoku
if /i "%~1"=="check" goto vexa_check
"%VEXA_NODE%" "%CD%\src\main.mjs" %*
exit /b %ERRORLEVEL%

:vexa_serve
"%VEXA_NODE%" "%CD%\tools\launch.mjs" %*
exit /b %ERRORLEVEL%

:vexa_test
"%VEXA_NODE%" "%CD%\tools\run-tests.mjs"
exit /b %ERRORLEVEL%

:vexa_demo
"%VEXA_NODE%" "%CD%\tools\demo.mjs"
exit /b %ERRORLEVEL%

:vexa_backtest
"%VEXA_NODE%" "%CD%\tools\backtest.mjs"
exit /b %ERRORLEVEL%

:vexa_glyphoku
"%VEXA_NODE%" "%CD%\tools\glyphoku-check.mjs"
exit /b %ERRORLEVEL%

:vexa_check
"%VEXA_NODE%" "%CD%\tools\check-package.mjs"
exit /b %ERRORLEVEL%

