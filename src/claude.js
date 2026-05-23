const SYSTEM = `You are a JSON-only API. Never output any text, explanation, markdown, or code fences. Output ONLY raw valid JSON. The very first character must be [ or {. No preamble. No postamble.`

export async function callClaude(prompt, maxTokens = 4000) {
  const resp = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`API ${resp.status}: ${t.slice(0, 200)}`)
  }

  const data = await resp.json()
  if (data.error) throw new Error(data.error.message)

  const text = data.content?.find(b => b.type === 'text')?.text || ''
  return parseJSON(text)
}

function parseJSON(text) {
  const stripped = text.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim()
  const ai = stripped.indexOf('[')
  const oi = stripped.indexOf('{')
  let start = -1
  if (ai === -1 && oi === -1) throw new Error('No JSON found')
  if (ai === -1) start = oi
  else if (oi === -1) start = ai
  else start = Math.min(ai, oi)
  const s = stripped.slice(start)
  try { return JSON.parse(s) } catch {
    const isArr = s[0] === '['
    const open = isArr ? '[' : '{'
    const close = isArr ? ']' : '}'
    let depth = 0, end = -1
    for (let i = 0; i < s.length; i++) {
      if (s[i] === open) depth++
      if (s[i] === close) { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) throw new Error('Malformed JSON')
    return JSON.parse(s.slice(0, end + 1))
  }
}
