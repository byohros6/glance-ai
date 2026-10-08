@echo off
setlocal
cd /d "%~dp0"
echo Verifying and building Glance AI...
call npm run check
if errorlevel 1 exit /b 1
call npm run verify:repo
if errorlevel 1 exit /b 1
call npm run test:release
if errorlevel 1 exit /b 1
call npm test
if errorlevel 1 exit /b 1
call npm run dist
if errorlevel 1 (
  echo [FAILED] Packaging failed. Existing files in dist may be from an older build.
  exit /b 1
)
call npm run release:prepare
if errorlevel 1 exit /b 1
for /f "tokens=*" %%v in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%v"
echo [SUCCESS] dist\Glance-AI-Portable-%APP_VERSION%.exe
echo [SUCCESS] dist\Glance-AI-Setup-%APP_VERSION%.exe
echo [SUCCESS] dist\SHA256SUMS.txt
exit /b 0
