@echo off
rem LINEA site monitor, every 5 minutes: Task Scheduler (SYSTEM) -> node monitor.mjs. ASCII only.
rem Remove task: schtasks /delete /tn LineaMonitor /f
setlocal
if not defined LINEA_OPS_HOME set "LINEA_OPS_HOME=C:\linea-ops"
if not exist "%LINEA_OPS_HOME%\logs" mkdir "%LINEA_OPS_HOME%\logs"
"C:\Program Files\nodejs\node.exe" "%~dp0monitor.mjs" >> "%LINEA_OPS_HOME%\logs\task-monitor.out" 2>&1
exit /b %ERRORLEVEL%
