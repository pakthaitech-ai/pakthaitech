PAKTHAI TECH - BUYER MATCH V3
=============================

1) Extract this ZIP.

2) IMPORTANT:
   Copy these TWO files:
      REPAIR_BUYER_MATCH_V3.js
      INSTALL_BUYER_MATCH_V3.bat

   into this exact existing project folder:
      D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL

   They should sit beside the existing package.json/wrangler files and
   the existing "src" folder.

3) Do NOT replace/delete the existing src folder.
   Do NOT run patch-buyer.js.
   Do NOT delete worker.js.

4) Double-click:
      INSTALL_BUYER_MATCH_V3.bat

5) The BAT will:
   - backup the current src\worker.js
   - patch ONLY /api/buyer-match/run
   - run node --check
   - deploy with wrangler
   - test the live endpoint

6) Expected final test should show something like:
   {"ok":true,"created":...,"processed_requirements":4,
    "matched_products":...,"duplicates_skipped":...,
    "skipped_keyword":0,
    "budget_check":"deferred_to_seller_opportunity_stage"}

7) Then refresh the Pakistan Buyer Center and click:
      Run Buyer Matching

NOTE:
The V3 repair does NOT approve or purchase anything.
Owner Approval remains mandatory.
