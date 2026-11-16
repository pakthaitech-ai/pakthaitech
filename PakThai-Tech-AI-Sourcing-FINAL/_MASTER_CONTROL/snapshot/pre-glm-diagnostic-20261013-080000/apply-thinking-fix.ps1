$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\support-chat.js'
$s = [IO.File]::ReadAllText($p)
$old = '      max_completion_tokens: 320'
$new = '      max_completion_tokens: 320,' + [Environment]::NewLine + '      reasoning_effort: "low",' + [Environment]::NewLine + '      chat_template_kwargs: { enable_thinking: false }'
if (-not $s.Contains($old)) { throw 'model options anchor not found' }
$s = $s.Replace($old, $new)
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))

$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\tools\audit\support-chat.test.mjs'
$s = [IO.File]::ReadAllText($p)
$old = '    assert.ok(input.messages.some(m => m.role === "system" && m.content.includes("Never invent products")));'
$new = '    assert.ok(input.messages.some(m => m.role === "system" && m.content.includes("Never invent products")));' + [Environment]::NewLine + '    assert.equal(input.reasoning_effort, "low");' + [Environment]::NewLine + '    assert.equal(input.chat_template_kwargs?.enable_thinking, false);'
if (-not $s.Contains($old)) { throw 'AI options test anchor not found' }
$s = $s.Replace($old, $new)
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))
Write-Output 'Disabled GLM chain-of-thought mode for short customer-support replies and added assertions.'
