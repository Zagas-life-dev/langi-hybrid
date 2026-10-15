// Pure word helpers shared by the server (video vocab profiles, coverage) and
// the client (highlighting unknown words in subtitles), so both split text into
// exactly the same keys. No imports — unit-testable and safe in any bundle.

export type WordStatus = 'known' | 'learning' | 'new'

// Elided prefixes ("l'homme", "qu'il", "jusqu'à") — the prefix is a function
// word, so only the part after the apostrophe counts.
const ELISION = /^(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu|quoiqu)['’](.+)$/

/**
 * Keys for one display token: lowercased, punctuation stripped, elision and
 * hyphen compounds split ("est-ce" → est, ce). Tokens with digits are dropped.
 */
export function tokenKeys(raw: string): string[] {
  const t = raw.normalize('NFC').toLowerCase().replace(/^[^\p{L}'’-]+|[^\p{L}'’-]+$/gu, '')
  if (!t || /\d/.test(t)) return []
  const m = t.match(ELISION)
  const rest = m ? m[1] : t
  return rest.split('-').map((p) => p.replace(/^['’]+|['’]+$/g, '')).filter((p) => /\p{L}/u.test(p))
}

/**
 * Keys for a caption line. A capitalised word that doesn't start a sentence is
 * taken for a name (Paris, Marie) and skipped — nobody "learns" those.
 */
export function textKeys(text: string): string[] {
  const out: string[] = []
  let sentenceStart = true
  for (const tok of text.split(/\s+/)) {
    if (!tok) continue
    const looksLikeName = !sentenceStart && /^\p{Lu}/u.test(tok.replace(/^[^\p{L}]+/u, ''))
    if (!looksLikeName) out.push(...tokenKeys(tok))
    sentenceStart = /[.!?…]["»”)]*$/.test(tok)
  }
  return out
}

/** Plural / feminine guesses for a key ("grandes" → grande, grand). */
export function variants(key: string): string[] {
  const v = [key]
  if (key.length > 3) {
    if (/[sx]$/.test(key)) v.push(key.slice(0, -1))
    if (key.endsWith('es')) v.push(key.slice(0, -2))
    if (key.endsWith('e')) v.push(key.slice(0, -1))
  }
  return [...new Set(v)]
}

// Grammar words every learner meets in week one. They make up roughly half of
// any spoken text, so without them every video would look impossibly hard.
// Infinitives here also cover their conjugations (via the lemma tables).
const FUNCTION_WORDS: Record<string, string> = {
  fr: `le la les un une des du de d l au aux à a et ou mais donc or ni car que qui quoi dont où
    je tu il elle on nous vous ils elles me te se moi toi lui leur leurs eux y en ce cet cette ces ça cela ceci
    mon ma mes ton ta tes son sa ses notre nos votre vos
    ne pas plus rien jamais personne non oui si très bien bon trop peu beaucoup aussi encore déjà toujours
    dans sur sous avec sans pour par chez entre vers depuis pendant avant après comme quand comment pourquoi combien
    ici là voilà voici alors puis enfin tout tous toute toutes autre même quel quelle quels quelles chaque
    être avoir aller faire pouvoir vouloir dire voir savoir venir devoir prendre
    euh ah oh bah ben hein ok okay bonjour salut merci`,
  es: `el la los las lo un una unos unas de del al a y e o u pero ni que qué quien quién cual cuál donde dónde
    yo tú tu él ella usted nosotros nosotras vosotros ellos ellas ustedes me te se nos os le les mi mis su sus
    nuestro nuestra vuestro vuestra este esta estos estas ese esa esos esas eso esto aquí allí ahí
    no sí si muy bien mal más menos mucho poco también ya todavía siempre nunca nada algo
    en con sin por para sobre entre hasta desde durante antes después como cuando cómo cuándo porque por qué
    todo toda todos todas otro otra mismo cada entonces pues
    ser estar haber tener ir hacer poder querer decir ver saber venir deber
    eh ah oh bueno vale hola gracias`,
}

const functionSets = new Map<string, Set<string>>()

export function isFunctionWord(lang: string, key: string): boolean {
  let set = functionSets.get(lang)
  if (!set) {
    set = new Set((FUNCTION_WORDS[lang] ?? '').split(/\s+/).filter(Boolean))
    functionSets.set(lang, set)
  }
  return set.has(key)
}

export interface VocabEntry { w: string; n: number }

/** Unique keys with counts, most frequent first. */
export function vocabProfile(lines: string[], cap = 3000): { vocab: VocabEntry[]; total: number } {
  const counts = new Map<string, number>()
  let total = 0
  for (const line of lines) {
    for (const k of textKeys(line)) {
      counts.set(k, (counts.get(k) ?? 0) + 1)
      total++
    }
  }
  const vocab = [...counts].map(([w, n]) => ({ w, n })).sort((a, b) => b.n - a.n).slice(0, cap)
  return { vocab, total }
}

export interface Coverage {
  /** Share of running words understood (learning words count half), 0–1. */
  coverage: number
  /** Distinct words the learner hasn't met. */
  newWords: number
}

export function coverageOf(vocab: VocabEntry[], statusOf: (w: string) => WordStatus): Coverage {
  let total = 0, score = 0, newWords = 0
  for (const { w, n } of vocab) {
    const s = statusOf(w)
    total += n
    if (s === 'known') score += n
    else if (s === 'learning') score += n / 2
    else newWords++
  }
  return { coverage: total ? score / total : 0, newWords }
}

/** "Just right" band for comprehensible input — enough known to follow, a few new words. */
export const SWEET_SPOT = { min: 0.85, max: 0.98, ideal: 0.94 }
