// Pure, dependency-free Leitner SRS logic. No DB or `@/` imports here, so it can
// be unit-tested with a plain `tsx` script. The DB-backed helpers live in srs.ts.
import type { AnswerTolerance } from '@/lib/models/Deck'

export const BOX_COUNT = 5
const DAY = 24 * 60 * 60 * 1000

// Graduating intervals for boxes 2..5 (box 1 = relearning, handled below).
export const DUE_AFTER_MS: Record<number, number> = {
  1: 0,
  2: 1 * DAY,
  3: 3 * DAY,
  4: 7 * DAY,
  5: 16 * DAY,
}

// Box 5 is a plateau, not a ceiling: each further correct answer there
// multiplies the interval (16d → 40d → 100d → …) up to MAX_INTERVAL_MS, so a
// word you truly know stops resurfacing twice a month forever. Consecutive
// top-box successes are read off correctStreak (4 correct answers reach box 5).
export const MATURE_GROWTH = 2.5
export const MAX_INTERVAL_MS = 365 * DAY

/** Interval for a correct answer that lands in `box` with `streak` consecutive correct. */
export function intervalFor(box: number, streak: number): number {
  if (box < BOX_COUNT) return DUE_AFTER_MS[box]
  // Successes AFTER first reaching box 5 (first arrival = streak 4 → 0 extra).
  const extraHits = Math.max(0, streak - (BOX_COUNT - 1))
  const ms = DUE_AFTER_MS[BOX_COUNT] * Math.pow(MATURE_GROWTH, extraHits)
  return Math.min(ms, MAX_INTERVAL_MS)
}

// A freshly-failed card is parked for this long (NOT `now`) so the cross-session
// `getDueCards` query doesn't immediately re-pull it. Within a single session the
// UI re-queues it instead (see MAX_SESSION_REVIEWS).
export const RELEARN_STEP_MS = 10 * 60 * 1000 // 10 minutes

// Max times one card is re-shown in a single session before it's parked — this
// is what guarantees a review session always terminates.
export const MAX_SESSION_REVIEWS = 3

// Cap on brand-new cards introduced per session so a learner isn't flooded.
export const NEW_PER_SESSION = 15

export type ReviewDirection = 'recognition' | 'production'

export interface AnswerCard {
  term: string
  translation: string
  acceptedAnswers?: string[]
  answerTolerance?: AnswerTolerance
  /** Sentence card: the word blanked out of `term` — the only answer, either direction. */
  cloze?: string
}

// --- Answer normalization & checking --------------------------------------

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const LEADING_ARTICLE = /^(le|la|les|un|une|des|du|de|the|a|an|to)\s+/
const ELIDED_ARTICLE = /^(l'|d'|j'|n')/

/**
 * Normalize an answer for comparison.
 * - Always: NFC, lowercase, trim, collapse whitespace, drop most punctuation.
 * - `lenient` ALSO strips accents and a single leading article (so "le chat" and
 *   "chat" both pass — fine for early learners).
 * - `strict` keeps accents and gender-bearing articles ("le chat" ≠ "la chat").
 */
export function normalizeAnswer(text: string, tolerance: AnswerTolerance = 'lenient'): string {
  let s = (text || '').normalize('NFC').toLowerCase().trim()
  s = s.replace(/[.,!?;:¡¿"“”«»()[\]{}]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  if (tolerance === 'lenient') {
    s = stripDiacritics(s)
    s = s.replace(ELIDED_ARTICLE, '')
    s = s.replace(LEADING_ARTICLE, '')
    s = s.trim()
  }
  return s
}

/** Collapse common speech-to-text artifacts before normal answer normalization. */
export function normalizeSpoken(text: string): string {
  return (text || '')
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The candidate correct answers for a card given the review direction. */
export function expectedAnswers(card: AnswerCard, direction: ReviewDirection): string[] {
  const out: string[] = []
  if (card.cloze) {
    out.push(card.cloze)
  } else if (direction === 'production') {
    out.push(card.term)
  } else {
    // Translation fields often pack alternates: "hi/hello, hey".
    out.push(...card.translation.split(/[/,;]/))
  }
  out.push(...(card.acceptedAnswers || []))
  return out.map((s) => s.trim()).filter(Boolean)
}

export function cardTolerance(card: Pick<AnswerCard, 'answerTolerance'>, deckTolerance: AnswerTolerance): AnswerTolerance {
  return card.answerTolerance || deckTolerance
}

/** True if `answer` matches any accepted answer for the card. */
export function checkAnswer(
  card: AnswerCard,
  answer: string,
  direction: ReviewDirection,
  deckTolerance: AnswerTolerance,
  spoken = false
): boolean {
  const tol = cardTolerance(card, deckTolerance)
  const raw = spoken ? normalizeSpoken(answer) : answer
  const a = normalizeAnswer(raw, tol)
  if (!a) return false
  return expectedAnswers(card, direction).some((e) => normalizeAnswer(e, tol) === a)
}

export const CLOZE_BLANK = '_____'

/** The sentence with its first whole-word `word` blanked ("Je bois un _____."). */
export function clozePrompt(sentence: string, word: string): string {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^\\p{L}])${esc}(?![\\p{L}])`, 'iu')
  return re.test(sentence) ? sentence.replace(re, `$1${CLOZE_BLANK}`) : `${sentence} (${CLOZE_BLANK})`
}

// --- Grading (pure) --------------------------------------------------------

export interface SrsState {
  box: number
  correctStreak: number
  lapses: number
  reps: number
}

export interface GradeResult {
  box: number
  dueAt: Date
  correctStreak: number
  lapses: number
  reps: number
}

/** Apply a correct/incorrect result to a card's SRS state. */
export function grade(prev: SrsState, correct: boolean, now = Date.now()): GradeResult {
  if (correct) {
    const box = Math.min(prev.box + 1, BOX_COUNT)
    const correctStreak = prev.correctStreak + 1
    return {
      box,
      dueAt: new Date(now + intervalFor(box, correctStreak)),
      correctStreak,
      lapses: prev.lapses,
      reps: prev.reps + 1,
    }
  }
  return {
    box: 1,
    dueAt: new Date(now + RELEARN_STEP_MS),
    correctStreak: 0,
    lapses: prev.lapses + 1,
    reps: prev.reps + 1,
  }
}
