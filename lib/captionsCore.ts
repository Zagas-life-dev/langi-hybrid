import type { ICaptionCue } from '@/lib/models/CaptionCache'

// Pure caption helpers (no DB / network) so they can be unit-tested.

export interface Json3 {
  events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string; tOffsetMs?: number }[] }[]
}

/** Base ISO code: 'es-419' → 'es', 'pt_BR' → 'pt'. */
export const baseCode = (code: string) => code.toLowerCase().split(/[-_]/)[0]

/** json3 → cues in seconds. Overlapping cues are clipped to the next one's start. */
export function parseJson3(j: Json3): ICaptionCue[] {
  const cues: ICaptionCue[] = []
  for (const e of j.events ?? []) {
    if (!e.segs || e.tStartMs === undefined) continue
    const text = e.segs.map((s) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim()
    if (!text) continue
    cues.push({ start: e.tStartMs / 1000, end: (e.tStartMs + (e.dDurationMs ?? 2000)) / 1000, text })
  }
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) cues[i].end = Math.max(cues[i].start + 0.3, cues[i + 1].start)
  }
  return cues
}

const SENTENCE_END = /[.!?…]["»”)]*$/
const MAX_LINE_CHARS = 90
const MIN_LINE_CHARS = 15
const PAUSE_S = 1.5    // a silence this long ends a line even without punctuation
const LINGER_S = 1.5   // how long a line stays up after its last word before a pause

/**
 * Auto-generated (ASR) json3 → sentence-sized cues. ASR events cut lines at
 * arbitrary points ("c'est la journée des" / "premières fois."), but every word
 * carries its own timing (tStartMs + tOffsetMs), so lines are rebuilt from the
 * words: break at sentence punctuation, at a pause, or when a line gets long.
 */
export function asrSentences(j: Json3): ICaptionCue[] {
  const words: { t: number; text: string }[] = []
  for (const e of j.events ?? []) {
    if (!e.segs || e.tStartMs === undefined) continue
    for (const s of e.segs) {
      const text = (s.utf8 ?? '').replace(/\s+/g, ' ').trim()
      if (text) words.push({ t: (e.tStartMs + (s.tOffsetMs ?? 0)) / 1000, text })
    }
  }
  words.sort((a, b) => a.t - b.t)

  const cues: ICaptionCue[] = []
  let line: typeof words = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    line.push(w)
    const next = words[i + 1]
    const text = line.map((x) => x.text).join(' ')
    const gap = next ? next.t - w.t : Infinity
    const tooLong = next ? text.length + 1 + next.text.length > MAX_LINE_CHARS : true
    if (!next || gap >= PAUSE_S || tooLong || (SENTENCE_END.test(w.text) && text.length >= MIN_LINE_CHARS)) {
      cues.push({ start: line[0].t, end: gap < PAUSE_S ? next!.t : w.t + LINGER_S, text })
      line = []
    }
  }
  return cues
}

/**
 * A model's keyed translation reply → index → line, for the requested indices
 * only. Accepts the asked-for `{"0": "…"}` object, and an array as a fallback
 * when its length matches exactly (any other array can't be aligned safely).
 */
export function keyedLines(raw: unknown, idx: number[]): Map<number, string> {
  const out = new Map<number, string>()
  const put = (i: number, v: unknown) => {
    const text = typeof v === 'string' ? v.trim() : ''
    if (text) out.set(i, text)
  }
  if (Array.isArray(raw)) {
    if (raw.length === idx.length) idx.forEach((i, n) => put(i, raw[n]))
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const i of idx) put(i, obj[String(i)])
  }
  return out
}
