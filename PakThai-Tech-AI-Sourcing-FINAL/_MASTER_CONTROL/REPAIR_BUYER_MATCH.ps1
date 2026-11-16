$ErrorActionPreference = "Stop"

$file = Join-Path (Get-Location) "src\worker.js"
$s = [System.IO.File]::ReadAllText($file)

$startMarker = '  if (u.pathname === "/api/buyer-match/run" && request.method === "POST") {'
$endMarker = '  return json({ ok: true, created });'

$start = $s.IndexOf($startMarker)
if ($start -lt 0) { throw "Buyer match start marker not found." }

$end = $s.IndexOf($endMarker, $start)
if ($end -lt 0) { throw "Buyer match end marker not found." }

# Include the closing brace of the existing route.
$afterEnd = $s.IndexOf("  }", $end)
if ($afterEnd -lt 0) { throw "Buyer match route closing brace not found." }
$afterEnd = $afterEnd + 3

$newBlock = @'
  if (u.pathname === "/api/buyer-match/run" && request.method === "POST") {
    // Process both active and legacy/new requirements.
    const qs = (await env.DB.prepare(
      "SELECT * FROM buyer_requirements WHERE status IN ('active','new') ORDER BY id DESC"
    ).all()).results || [];

    let created = 0;
    let skippedBudget = 0;
    let skippedKeyword = 0;

    for (const q of qs) {
      const k = String(q.product_keyword || "").trim().toLowerCase();
      if (!k) {
        skippedKeyword++;
        continue;
      }

      const quantity = Math.max(1, Math.floor(Number(q.quantity) || 1));
      const maxBudget = Number(q.max_budget_pkr) || 0;

      const ps = (await env.DB.prepare(
        "SELECT id, title, price_pkr FROM products WHERE sourcing_enabled=1 AND lower(title) LIKE ? ORDER BY id DESC LIMIT 50"
      ).bind("%" + k + "%").all()).results || [];

      for (const p of ps) {
        const retailUnit = Number(p.price_pkr) || 0;
        const retailTotal = retailUnit * quantity;

        // Budget is treated as a total budget. A zero budget means no budget filter.
        if (maxBudget > 0 && retailTotal > maxBudget) {
          skippedBudget++;
          continue;
        }

        const old = await env.DB.prepare(
          "SELECT id FROM buyer_matches WHERE buyer_id=? AND requirement_id=? AND product_id=? LIMIT 1"
        ).bind(q.buyer_id, q.id, p.id).first();

        if (old) continue;

        await env.DB.prepare(
          "INSERT INTO buyer_matches (buyer_id,requirement_id,product_id,seller_id,match_status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))"
        ).bind(
          q.buyer_id,
          q.id,
          p.id,
          null,
          "matched",
          "Automatic product match - seller selection pending"
        ).run();

        created++;
      }
    }

    return json({
      ok: true,
      created,
      processed_requirements: qs.length,
      skipped_keyword: skippedKeyword,
      skipped_budget: skippedBudget
    });
  }
'@

$s = $s.Substring(0, $start) + $newBlock + $s.Substring($afterEnd)
[System.IO.File]::WriteAllText($file, $s, [System.Text.UTF8Encoding]::new($false))

Write-Host "BUYER MATCH FINAL REPAIR INSTALLED."
Write-Host "Requirements: active + new"
Write-Host "Keyword matching: case-insensitive"
Write-Host "Budget: total budget check (zero = no filter)"
Write-Host "Duplicates: prevented"
Write-Host "Worker saved: src\worker.js"
