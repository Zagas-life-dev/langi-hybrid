import { readFileSync } from 'fs'
import path from 'path'

// Offline de-inflection from the conjugation tables we already ship
// (data/french/lefff-conjugations.json, data/spanish/jehle-conjugations.json):
// a conjugated form like "mangé" or "fuimos" maps back to its infinitive, so a
// tapped verb can be answered from the database instead of an AI call.
// Server-only (reads from disk); the reverse index is built once per process.

export interface Lemma {
  infinitive: string
  english?: string // Spanish table carries an English gloss; French doesn't
}

const FILES: Record<string, string> = {
  fr: 'data/french/lefff-conjugations.json',
  es: 'data/spanish/jehle-conjugations.json',
}

const cache = new Map<string, Map<string, Lemma>>()

function collectForms(value: unknown, out: string[]) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) collectForms(v, out)
}

function buildIndex(lang: string): Map<string, Lemma> {
  const index = new Map<string, Lemma>()
  const file = FILES[lang]
  if (!file) return index
  let table: Record<string, Record<string, unknown>>
  try {
    table = JSON.parse(readFileSync(path.join(process.cwd(), file), 'utf8'))
  } catch {
    return index // table missing in this deployment — just no lemma hits
  }
  for (const [infinitive, entry] of Object.entries(table)) {
    const english = typeof entry.english === 'string' ? entry.english : undefined
    const forms: string[] = [infinitive]
    for (const [key, v] of Object.entries(entry)) if (key !== 'english') collectForms(v, forms)
    for (const f of forms) {
      const k = f.trim().toLowerCase()
      // "NA" marks a missing cell (e.g. imperative 1st person) in the Lefff table.
      if (!k || k === 'na' || index.has(k)) continue
      index.set(k, { infinitive, english })
    }
  }
  return index
}

/** The infinitive a conjugated form belongs to, or null. */
export function lemmatize(lang: string, word: string): Lemma | null {
  let index = cache.get(lang)
  if (!index) {
    index = buildIndex(lang)
    cache.set(lang, index)
  }
  return index.get(word.trim().toLowerCase()) ?? null
}
