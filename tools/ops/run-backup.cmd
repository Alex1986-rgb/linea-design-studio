@echo off
rem LINEA nightly backup: Task Scheduler (SYSTEM) -> node bk.mjs backup. ASCII only (cmd reads OEM code page).
rem Remove task: schtasks /delete /tn LineaBackup /f
setlocal
if not defined LINEA_OPS_HOME set "LINEA_OPS_HOME=C:\linea-ops"
if not exist "%LINEA_OPS_HOME%\logs" mkdir "%LINEA_OPS_HOME%\logs"
start "" /b /wait /belownormal "C:\Program Files\nodejs\node.exe" "%~dp0bk.mjs" backup %* >> "%LINEA_OPS_HOME%\logs\task-backup.out" 2>&1
exit /b %ERRORLEVEL%
