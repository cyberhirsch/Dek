@echo off
rem Starts the Dek Helper (local voice for narration). Leave this window open.
title Dek Helper
cd /d "%~dp0"
call npm run helper
pause
