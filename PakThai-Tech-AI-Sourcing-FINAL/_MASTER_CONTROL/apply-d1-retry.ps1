$ErrorActionPreference='Stop'
$p='D:\pakthai\PakThai-Tech-AI-SOURCING-FINAL\src\worker.js'
$s=[System.IO.File]::ReadAllText($p)
$backup=$p+'.pre-d1-batch-retry-20261027.bak'
Copy-Item $p $backup -Force
$anchor='async function discoverSourceHandles() {'
if(-not $s.Contains($anchor)){throw 'Source discovery anchor missing; no change made.'}
$helper=@'
async function d1BatchWithRetry(db, statements, label = "catalog sync") {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { return await db.batch(statements); }
    catch (e) {
      lastError = e;
      const message = String(e?.message || e);
      const transient = /D1_ERROR: internal error|internal error; reference|temporar|overloaded|SQLITE_BUSY|database is locked/i.test(message);
      if (!transient || attempt === 4) break;
      await new Promise(resolve => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
    }
  }
  throw new Error(String(label) + ' D1 batch failed after retry policy: ' + String(lastError?.message || lastError));
}

'@
$s=$s.Replace($anchor,$helper+$anchor)
$old='if (productWrites.length) await db.batch(productWrites);'
if(-not $s.Contains($old)){throw 'Product write batch anchor missing; no change made.'}
$s=$s.Replace($old,'if (productWrites.length) await d1BatchWithRetry(db, productWrites, "catalog product persistence");')
$pattern='(?s)await env\.DB\.batch\(\[(.*?)\r?\n  \]\);'
$matches=[regex]::Matches($s,$pattern)
if($matches.Count -lt 3){throw ('Expected multiple status batches; found '+$matches.Count+'; no write made.')}
$count=0
$s=[regex]::Replace($s,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{
 param($m)
 $count++
 if($count -eq 1){return $m.Value}
 return 'await d1BatchWithRetry(env.DB, ['+$m.Groups[1].Value+[Environment]::NewLine+'  ], "catalog sync status");'
})
[System.IO.File]::WriteAllText($p,$s,[System.Text.UTF8Encoding]::new($false))
Write-Output ('Applied transient D1 batch retries; backup='+$backup+'; matches='+$count)
