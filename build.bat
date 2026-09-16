@echo off
cd /d "%~dp0"
echo ====================================================
echo  Building Glance AI (Installer & Portable Executable)
echo ====================================================
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_SIGN_PARAMS=""
npx electron-builder --win
echo.
if exist "dist\Glance-AI-Portable.exe" (
  echo [SUCCESS] Portable executable: dist\Glance-AI-Portable.exe
)
if exist "dist\Glance-AI-Setup-1.1.0.exe" (
  echo [SUCCESS] 1-Click Fast Installer: dist\Glance-AI-Setup-1.1.0.exe
)
echo.
pause
