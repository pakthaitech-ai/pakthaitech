@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo PAKTHAI TECH - BUYER MATCH V3 REPAIR
echo ==============================================
echo.

if not exist "src\worker.js" (
  echo ERROR: src\worker.js not found.
  echo Make sure this BAT is inside:
  echo D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL
  pause
  exit /b 1
)

if not exist "REPAIR_BUYER_MATCH_V3.js" (
  echo ERROR: REPAIR_BUYER_MATCH_V3.js not found.
  pause
  exit /b 1
)

echo [1/4] Applying V3 repair...
node REPAIR_BUYER_MATCH_V3.js
if errorlevel 1 (
  echo.
  echo REPAIR FAILED. No deploy was attempted.
  pause
  exit /b 1
)

echo.
echo [2/4] Checking worker.js syntax...
node --check src\worker.js
if errorlevel 1 (
  echo.
  echo SYNTAX CHECK FAILED.
  echo Restore the .bak-v3 backup shown above before deploying.
  pause
  exit /b 1
)

echo.
echo [3/4] Deploying to Cloudflare...
npx wrangler deploy
if errorlevel 1 (
  echo.
  echo DEPLOY FAILED.
  pause
  exit /b 1
)

echo.
echo [4/4] Testing Buyer Match endpoint...
curl -s -X POST "https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/buyer-match/run" -H "Content-Type: application/json" -d "{}"

echo.
echo.
echo ==============================================
echo V3 REPAIR + DEPLOY FINISHED
echo ==============================================
echo.
echo Budget is now checked later at seller/opportunity stage.
echo Owner approval remains mandatory.
echo.
pause
