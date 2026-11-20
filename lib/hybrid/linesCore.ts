// Pure parsers for short plain-text replies. Nano answers much faster in plain lines than in
// schema-constrained JSON, so quick tasks (quiz options, example sentences) use these.

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').trim()

/** One item per line: strips bullets, numbering and quotes; drops blanks, repeats and `exclude`d values. */
export function parseLines(raw: string, exclude: string[] = [], max = 3): string[] {
  const banned = new Set(exclude.map(norm))
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const clean = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^["“«]+|["”»]+$/g, '')
      .replace(/[.;]+$/, '')
      .trim()
    if (!clean || clean.length > 80) continue
    const key = norm(clean)
    if (banned.has(key)) continue
    banned.add(key)
    out.push(clean)
    if (out.length >= max) break
  }
  return out
}

/** `sentence | translation` per line, for dictation. Lines without a sentence are dropped. */
export function parseDictationLines(raw: string, max = 6): { text: string; translation: string }[] {
  const out: { text: string; translation: string }[] = []
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()
    if (!clean) continue
    const [text, ...rest] = clean.split('|')
    const unquote = (s: string) => s.trim().replace(/^["“«]+|["”»]+$/g, '').trim()
    const sentence = unquote(text)
    if (sentence.length < 3 || sentence.length > 220) continue
    out.push({ text: sentence, translation: unquote(rest.join('|')) })
    if (out.length >= max) break
  }
  return out
}

/** Two lines: the sentence, then its translation. A single line is a sentence without a translation. */
export function parseExample(raw: string): { sentence: string; translation: string } | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^(?:sentence|example|translation|english)\s*:\s*/i, '').trim())
    .filter(Boolean)
  if (!lines.length) return null
  return { sentence: lines[0], translation: lines[1] || '' }
}
