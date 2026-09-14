@echo off
cd /d "%~dp0"
echo ====================================================
echo  Building UndecGPT Standalone Portable Executable
echo ====================================================
echo.
npx electron-builder --win portable
echo.
if exist "dist\UndecGPT-Portable.exe" (
  echo [SUCCESS] Portable executable built: dist\UndecGPT-Portable.exe
) else (
  echo [INFO] Build process finished. Check dist folder.
)
echo.
pause
