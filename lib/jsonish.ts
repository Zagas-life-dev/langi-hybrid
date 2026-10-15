// Pure helper (no imports) so it can be unit-tested: pull the JSON out of a
// model reply. Models wrap JSON in prose or code fences, and some (seen with
// Gemini) repeat a tail of the answer after the closing brace, e.g.
// `{"lines":["a","b"]}\nb"]}` — so take the first BALANCED object/array rather
// than everything up to the last brace.

/** The first balanced `{…}` or `[…]` starting at `from`, string-aware. */
function balancedAt(s: string, from: number): string | null {
  const open = s[from]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close && --depth === 0) return s.slice(from, i + 1)
  }
  return null
}

export function loadsJsonish(s: string): unknown {
  if (!s) return null
  const t = s.trim()
  try { return JSON.parse(t) } catch { /* fall through */ }
  for (const ch of ['{', '[']) {
    for (let at = t.indexOf(ch); at !== -1; at = t.indexOf(ch, at + 1)) {
      const chunk = balancedAt(t, at)
      if (!chunk) break
      try { return JSON.parse(chunk) } catch { /* try the next opening */ }
    }
  }
  return null
}
