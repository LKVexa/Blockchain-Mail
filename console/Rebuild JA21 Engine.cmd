@echo off
setlocal
call "%~dp0host\portable-env.cmd" || exit /b %ERRORLEVEL%
cd /d "%~dp0"
set PYTHONDONTWRITEBYTECODE=1
set PY=
where py.exe >nul 2>nul && set "PY=py.exe -3"
if not defined PY where python.exe >nul 2>nul && set "PY=python.exe"
if not defined PY (
  echo ERROR: Python 3 is required to rebuild JA21 policy IR. It is not required to launch the browser.
  exit /b 2
)
%PY% "%~dp0tools\ja21_core.py" "%~dp0source\browser.ja" -o "%~dp0engine\ja21\browser.ir.json" || exit /b %ERRORLEVEL%
%PY% "%~dp0tools\ja21_core.py" "%~dp0source\renderer.ja" -o "%~dp0engine\ja21\renderer.ir.json" || exit /b %ERRORLEVEL%
%PY% "%~dp0tools\ja21_core.py" "%~dp0source\web_engine.ja" -o "%~dp0engine\ja21\web_engine.ir.json" || exit /b %ERRORLEVEL%
echo NOTE: The native DF_Medium DLL is source-bound. Rebuilding web_engine.ja requires recompiling the native DLL before resealing.
exit /b 0
