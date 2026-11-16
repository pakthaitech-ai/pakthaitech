@echo off
cd /d "%~dp0"
echo ==========================================
echo PAKTHAI TECH - BUYER MATCHES UI REPAIR
echo ==========================================
echo.
node patch_buyer_matches_ui.js
if errorlevel 1 (
  echo.
  echo PATCH FAILED. worker.js was not deployed.
  pause
  exit /b 1
)
echo.
echo Checking JavaScript syntax...
node --check src\worker.js
if errorlevel 1 (
  echo.
  echo SYNTAX CHECK FAILED. Restore backup if needed:
  echo src\worker.js.before-buyer-matches-ui
  pause
  exit /b 1
)
echo.
echo Deploying to Cloudflare...
call npx wrangler deploy
if errorlevel 1 (
  echo.
  echo DEPLOY FAILED. Review the error above.
  pause
  exit /b 1
)
echo.
echo DEPLOY COMMAND COMPLETED.
echo Live buyer matches API:
echo https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/buyer-matches
echo.
pause
