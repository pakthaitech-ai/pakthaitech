$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\support-chat.js'
$s = [IO.File]::ReadAllText($p)
$old = 'const reply = cleanText(result?.response || result?.result?.response || "", 1800);'
$new = 'const reply = cleanText(result?.response || result?.result?.response || result?.choices?.[0]?.message?.content || result?.result?.choices?.[0]?.message?.content || "", 1800);'
if (-not $s.Contains($old)) { throw 'support-chat reply parser anchor not found' }
$s = $s.Replace($old, $new)
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))

$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\tools\audit\support-chat.test.mjs'
$s = [IO.File]::ReadAllText($p)
$old = 'function makeEnv({ attempts = 1, products = [], aiReply = "Hello from PakThai support." } = {}) {'
$new = 'function makeEnv({ attempts = 1, products = [], aiReply = "Hello from PakThai support.", aiResult = null } = {}) {'
if (-not $s.Contains($old)) { throw 'support test fixture anchor not found' }
$s = $s.Replace($old, $new)
$old = '    return { response: aiReply };'
$new = '    return aiResult || { response: aiReply };'
if (-not $s.Contains($old)) { throw 'support test AI result anchor not found' }
$s = $s.Replace($old, $new)
$needle = 'test("support chat falls back safely if Cloudflare AI is unavailable", async () => {'
$insert = @'
test("support chat reads OpenAI-compatible choices output from the alternative model", async () => {
  const { env } = makeEnv({ aiResult: { choices: [{ message: { content: "GLM model reply." } }] } });
  const response = await worker.fetch(post({ message: "Hello" }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "ai");
  assert.equal(body.reply, "GLM model reply.");
});

'@
if (-not $s.Contains($needle)) { throw 'support test insertion anchor not found' }
$s = $s.Replace($needle, $insert + $needle)
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))
Write-Output 'Patched alternative-model output parsing and added regression test.'
