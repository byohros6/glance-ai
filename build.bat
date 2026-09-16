@echo off
cd /d "%~dp0"
echo ====================================================
echo  Building Glance AI (Installer & Portable Executable)
echo ====================================================
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_SIGN_PARAMS=""
npx electron-builder --win
echo.
for /f "tokens=*" %%v in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%v"
if exist "dist\Glance-AI-Portable-%APP_VERSION%.exe" (
  echo [SUCCESS] Portable executable: dist\Glance-AI-Portable-%APP_VERSION%.exe
) else if exist "dist\Glance-AI-Portable.exe" (
  echo [SUCCESS] Portable executable: dist\Glance-AI-Portable.exe
)
if exist "dist\Glance-AI-Setup-%APP_VERSION%.exe" (
  echo [SUCCESS] Interactive Setup Wizard: dist\Glance-AI-Setup-%APP_VERSION%.exe
)
echo.
pause
