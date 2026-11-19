// Pure helpers for Live Correct (no Firebase imports, so they are unit-testable).
// Nano answers fastest in plain text, so the model replies in a tiny line format:
//   line 1: the corrected sentence (or just "OK")
//   then:   wrong -> right (short reason)

export interface Mistake { wrong: string; right: string; why: string }
export interface Correction { ok: boolean; corrected: string; mistakes: Mistake[] }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').replace(/[.!?¿¡]+$/g, '').trim()

export function correctionInstructions(langName: string, lang: string): string {
  const example = lang === 'fr'
    ? `\nExample input: Hier je mange une pomme.\nExample output:\nHier, j'ai mangé une pomme.\nje mange -> j'ai mangé (past tense)`
    : ''
  return `Fix this ${langName} from an English-speaking learner. Line 1: the corrected sentence. Then one short line per mistake: wrong -> right (3-6 word English reason). Fix tense, agreement and spelling too. If it is already correct, reply only: OK.${example}`
}

/** Parse the line format above. Tolerant of bullets, quotes and arrows. */
export function parseCorrection(raw: string, original: string): Correction {
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
  if (!lines.length) return { ok: true, corrected: original, mistakes: [] }
  const first = lines[0].replace(/^["“«]|["”»]$/g, '')
  if (/^(ok|correct|c'est correct)[.!]*$/i.test(first)) return { ok: true, corrected: original, mistakes: [] }

  const mistakes: Mistake[] = []
  for (const l of lines.slice(1)) {
    const m = l.match(/^(.+?)\s*(?:->|→|=>)\s*(.+?)(?:\s*[(（](.+?)[)）])?\s*$/)
    if (!m) continue
    const wrong = m[1].replace(/^["“«]|["”»]$/g, '').trim()
    const right = m[2].replace(/^["“«]|["”»]$/g, '').trim()
    if (wrong && right && norm(wrong) !== norm(right)) mistakes.push({ wrong, right, why: (m[3] || '').trim() })
  }
  const same = norm(first) === norm(original)
  if (same && !mistakes.length) return { ok: true, corrected: original, mistakes: [] }
  return { ok: false, corrected: first, mistakes }
}

export interface Segment { text: string; mistake?: Mistake }

/** Split `text` into plain and highlighted segments for the mistakes found in it. */
export function highlight(text: string, mistakes: Mistake[]): Segment[] {
  const spans: { start: number; end: number; mistake: Mistake }[] = []
  for (const m of mistakes) {
    const hay = text.toLowerCase()
    const needle = m.wrong.toLowerCase()
    let from = 0
    for (;;) {
      const i = hay.indexOf(needle, from)
      if (i < 0) break
      const end = i + needle.length
      if (!spans.some((s) => i < s.end && end > s.start)) { spans.push({ start: i, end, mistake: m }); break }
      from = i + 1
    }
  }
  spans.sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  let at = 0
  for (const s of spans) {
    if (s.start > at) out.push({ text: text.slice(at, s.start) })
    out.push({ text: text.slice(s.start, s.end), mistake: s.mistake })
    at = s.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}
