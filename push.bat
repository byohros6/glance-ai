@echo off
cd /d "%~dp0"
echo ====================================================
echo  Pushing Glance AI to GitHub (main branch)
echo ====================================================
git push -u origin main
echo.
pause
