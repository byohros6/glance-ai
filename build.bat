@echo off
cd /d "%~dp0"
echo ====================================================
echo  Building Glance AI Standalone Portable Executable
echo ====================================================
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_SIGN_PARAMS=""
npx electron-builder --win portable
echo.
if exist "dist\Glance-AI-Portable.exe" (
  echo [SUCCESS] Portable executable built: dist\Glance-AI-Portable.exe
) else (
  echo [INFO] Build process finished. Check dist folder.
)
echo.
pause
