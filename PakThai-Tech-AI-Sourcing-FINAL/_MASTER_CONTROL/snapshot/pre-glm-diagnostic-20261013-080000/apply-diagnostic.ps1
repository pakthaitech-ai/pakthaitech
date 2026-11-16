$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\support-chat.js'
$s = [IO.File]::ReadAllText($p)
$old = '      max_tokens: 320'
$new = '      max_completion_tokens: 320'
if (-not $s.Contains($old)) { throw 'max_tokens anchor not found' }
$s = $s.Replace($old, $new)
$old = '    const reply = cleanText(result?.response || result?.result?.response || result?.choices?.[0]?.message?.content || result?.result?.choices?.[0]?.message?.content || "", 1800);'
$new = @'
    const rawReply = result?.response || result?.result?.response || result?.choices?.[0]?.message?.content || result?.result?.choices?.[0]?.message?.content || result?.choices?.[0]?.text || "";
    if (!rawReply) console.warn("support-chat AI returned no recognized text field", {
      result_keys: Object.keys(result || {}).slice(0, 12),
      result_type: typeof result,
      choices_count: Array.isArray(result?.choices) ? result.choices.length : 0,
      first_choice_keys: Object.keys(result?.choices?.[0] || {}).slice(0, 12),
      first_message_keys: Object.keys(result?.choices?.[0]?.message || {}).slice(0, 12)
    });
    const reply = cleanText(rawReply, 1800);
'@
if (-not $s.Contains($old)) { throw 'reply parser anchor not found' }
$s = $s.Replace($old, $new.TrimEnd([char]13,[char]10))
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))
Write-Output 'Added bounded response-shape diagnostics and modern token parameter.'
