// ---------------------------------------------------------------------------
// Pronunciation / dictation scoring — pure, dependency-free, browser-safe.
//
// The Web Speech API gives us a TRANSCRIPT of what the learner said, not a raw
// audio score. So we score pronunciation the way a human would grade a read-back:
// align what the recognizer heard against the target text, word by word, and
// report which words landed, which were close, and which were missed. It is not
// phoneme-level (the browser can't give us that on-device), but it turns the mic
// from "fills the box" into honest, per-word feedback — the gap the app had.
//
// The SAME aligner powers dictation (compare a TYPED answer to the target), so
// listening gap-fill and speaking share one code path.
// ---------------------------------------------------------------------------

export type WordStatus = 'correct' | 'close' | 'wrong'

export interface ScoredWord {
  /** The target word, as written (accents/case preserved for display). */
  text: string
  status: WordStatus
  /** The heard/typed word aligned to this target word, if any. */
  heard?: string
}

export interface PronunciationResult {
  /** 0–100. correct = full credit, close = partial, missed/wrong = none. */
  score: number
  words: ScoredWord[]
  /** Words the learner produced that don't correspond to any target word. */
  extras: string[]
  /** Coarse verdict for headline UI. */
  verdict: 'great' | 'good' | 'try-again'
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Normalize a chunk to comparable tokens: lowercase, de-accent, split on spaces
 *  AND apostrophes (so "j'ai" → ["j","ai"], matching how STT tends to emit it). */
export function tokenize(text: string): string[] {
  return stripDiacritics((text || '').toLowerCase())
    .replace(/['’]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/** Character-level Levenshtein similarity in [0,1]. Cheap; words are short. */
export function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const m = a.length
  const n = b.length
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(
        dp[j] + 1, // deletion
        dp[j - 1] + 1, // insertion
        prev + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      )
      prev = tmp
    }
  }
  const dist = dp[n]
  return 1 - dist / Math.max(m, n)
}

const EXACT = 0.85 // ≥ this normalized similarity counts as a clean hit
const CLOSE = 0.55 // ≥ this is "almost" — partial credit, amber highlight

interface Aligned {
  targetIdx: number | null
  heardIdx: number | null
  sim: number
}

// Needleman–Wunsch alignment of target↔heard tokens with a similarity-aware
// substitution cost, so "bonjour" vs "bonjours" aligns instead of being scored as
// one deletion + one insertion. Gap cost 1; match cost 1−similarity.
function align(target: string[], heard: string[]): Aligned[] {
  const m = target.length
  const n = heard.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) dp[i][0] = i
  for (let j = 1; j <= n; j++) dp[0][j] = j
  const sim: number[][] = Array.from({ length: m }, () => new Array(n).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = wordSimilarity(target[i - 1], heard[j - 1])
      sim[i - 1][j - 1] = s
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (1 - s)
      )
    }
  }
  // Backtrack.
  const out: Aligned[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (1 - sim[i - 1][j - 1])) {
      out.push({ targetIdx: i - 1, heardIdx: j - 1, sim: sim[i - 1][j - 1] })
      i--
      j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      out.push({ targetIdx: i - 1, heardIdx: null, sim: 0 })
      i--
    } else {
      out.push({ targetIdx: null, heardIdx: j - 1, sim: 0 })
      j--
    }
  }
  return out.reverse()
}

/**
 * Score a spoken/typed attempt against the target sentence.
 * `targetDisplay` preserves the original target words for highlighting; matching
 * is done on the normalized tokens.
 */
export function scorePronunciation(target: string, heard: string): PronunciationResult {
  const displayWords = (target || '').trim().split(/\s+/).filter(Boolean)
  const targetTokens = tokenize(target)
  const heardTokens = tokenize(heard)

  // Map each normalized target token back to a display word. tokenize() can split
  // one display word into several tokens (apostrophes), so align by walking both.
  const tokenToDisplay: number[] = []
  {
    let di = 0
    let acc: string[] = []
    for (let d = 0; d < displayWords.length; d++) {
      const parts = tokenize(displayWords[d])
      for (let p = 0; p < parts.length; p++) tokenToDisplay.push(d)
      acc = acc.concat(parts)
      di += parts.length
    }
    // If counts disagree (rare), pad with the last index.
    while (tokenToDisplay.length < targetTokens.length) tokenToDisplay.push(displayWords.length - 1)
    void di
    void acc
  }

  const pairs = align(targetTokens, heardTokens)

  // Per display-word status = best status among its tokens.
  const rank: Record<WordStatus, number> = { wrong: 0, close: 1, correct: 2 }
  const perDisplay: { status: WordStatus; heard?: string }[] = displayWords.map(() => ({ status: 'wrong' as WordStatus }))
  const extras: string[] = []
  let credit = 0

  for (const p of pairs) {
    if (p.targetIdx === null) {
      if (p.heardIdx !== null) extras.push(heardTokens[p.heardIdx])
      continue
    }
    const status: WordStatus = p.sim >= EXACT ? 'correct' : p.sim >= CLOSE ? 'close' : 'wrong'
    credit += status === 'correct' ? 1 : status === 'close' ? 0.6 : 0
    const d = tokenToDisplay[p.targetIdx] ?? displayWords.length - 1
    if (rank[status] >= rank[perDisplay[d].status]) {
      perDisplay[d] = { status, heard: p.heardIdx !== null ? heardTokens[p.heardIdx] : undefined }
    }
  }

  const score = targetTokens.length ? Math.round((credit / targetTokens.length) * 100) : 0
  const words: ScoredWord[] = displayWords.map((text, d) => ({
    text,
    status: perDisplay[d].status,
    heard: perDisplay[d].heard,
  }))
  const verdict: PronunciationResult['verdict'] = score >= 85 ? 'great' : score >= 60 ? 'good' : 'try-again'
  return { score, words, extras, verdict }
}
