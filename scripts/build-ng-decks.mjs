/**
 * Build sentence-pair flashcard decks for Yoruba / Igbo / Hausa from open corpora.
 * Offline + file-only: never touches the database. Review the output, then seed.
 *
 *   1. Reads data/african/mafand/en-<yor|ibo|hau>.*.json and, for yo, menyo20k/*.tsv:
 *        yo: MENYO-20k + MAFAND-MT   ig, ha: MAFAND-MT
 *      Check each dataset's license before committing the raw files (MAFAND-MT is
 *      CC-BY-NC). Raw data/african/ is gitignored; only generated decks are kept.
 *   2. node scripts/build-ng-decks.mjs yo      (or ig / ha / all)
 *   3. DO NOT seed to Mongo (DB is moving to Firestore). Seed after that migration.
 *
 * Filter: 3-12 words, no digits/urls/brackets, deduped, English not identical.
 * Sorted short->long so early decks are easiest (A1 -> A2 -> B1).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const LANGS = {
  yo: { dir: 'yoruba', name: 'Yoruba' },
  ig: { dir: 'igbo', name: 'Igbo' },
  ha: { dir: 'hausa', name: 'Hausa' },
}
const DECK_SIZE = 50
const MAX_DECKS = 40
const LEVELS = [['A1', 0.3], ['A2', 0.4], ['B1', 0.3]]

const arg = (process.argv[2] || 'all').toLowerCase()
const targets = arg === 'all' ? Object.keys(LANGS) : [arg]

const words = (t) => t.trim().split(/\s+/).length
const NL = String.fromCharCode(10)
const TAB = String.fromCharCode(9)
const BOM = new RegExp(String.fromCharCode(0xfeff), 'g')
const BAD = new RegExp('[0-9@\\[\\]{}<>_/\\\\|]|https?:|www\\.', 'i')
const clean = (t) => !BAD.test(t)

// Corpus artefacts that make poor flashcards: speaker tags ("BG:", "INEC:"), leading or unbalanced
// quotes and dashes, brackets, ellipses, hashtags, acronyms in capitals, and pairs whose lengths
// don't line up (usually a misaligned translation).
const SPEAKER = /^[A-Za-z]{1,6}:\s/
const LEAD = /^["'“”‘’«»\-–—.,;:!?#*•]/
const oddQuotes = (s) => ((s.match(/["“”]/g) || []).length % 2) === 1
const ACRONYM = /\b[A-Z]{3,}\b/
const ODD = /[()\[\]…]|\.\.\.|#|\bvisit\b|[:;,]\s*$/i
function pairOk(t, e) {
  for (const s of [t, e]) {
    if (SPEAKER.test(s) || LEAD.test(s) || oddQuotes(s) || ACRONYM.test(s) || ODD.test(s)) return false
  }
  const ratio = words(e) / words(t)
  return ratio >= 0.4 && ratio <= 2.6
}

for (const code of targets) {
  const meta = LANGS[code]
  if (!meta) throw new Error(`Unknown lang ${code}. Use yo, ig, ha or all.`)
  const raw = []
  // MAFAND-MT: JSONL, {"translation": {"en": ..., "<yor|ibo|hau>": ...}}
  const mcode = { yo: 'yor', ig: 'ibo', ha: 'hau' }[code]
  for (const split of ['train', 'dev', 'test']) {
    const f = path.join('data', 'african', 'mafand', `en-${mcode}.${split}.json`)
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split(NL)) {
      if (!line.trim()) continue
      try { const t = JSON.parse(line).translation; raw.push([t[mcode], t.en]) } catch {}
    }
  }
  // MENYO-20k (Yoruba only): TSV with header, columns English<TAB>Yoruba, BOMs present
  if (code === 'yo') {
    for (const split of ['train', 'dev', 'test']) {
      const f = path.join('data', 'african', 'menyo20k', `${split}.tsv`)
      if (!existsSync(f)) continue
      for (const line of readFileSync(f, 'utf8').split(NL).slice(1)) {
        const [e, y] = line.replace(BOM, '').split(TAB)
        raw.push([y, e])
      }
    }
  }
  if (!raw.length) { console.log(`${code}: no data in data/african/, skipped`); continue }

  const seen = new Set()
  const pairs = []
  for (const [t0, e0] of raw) {
    const t = t0?.normalize('NFC').trim(), e = e0?.trim()
    if (!t || !e || t.toLowerCase() === e.toLowerCase()) continue
    const n = words(t)
    if (n < 3 || n > 12 || words(e) > 16 || !clean(t) || !clean(e) || !pairOk(t, e)) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key); pairs.push({ t, e, n })
  }
  pairs.sort((a, b) => a.n - b.n || a.t.length - b.t.length)

  const total = Math.min(Math.floor(pairs.length / DECK_SIZE), MAX_DECKS)
  if (!total) { console.log(`${code}: only ${pairs.length} usable pairs, need ${DECK_SIZE}+`); continue }
  // spread picks evenly across the sorted list so every level is represented
  const picked = Array.from({ length: total * DECK_SIZE }, (_, i) => pairs[Math.floor((i * pairs.length) / (total * DECK_SIZE))])

  const outDir = path.join('data', meta.dir)
  mkdirSync(outDir, { recursive: true })
  for (let d = 0; d < total; d++) {
    const frac = d / total
    let acc = 0, level = 'B1'
    for (const [lv, share] of LEVELS) { acc += share; if (frac < acc) { level = lv; break } }
    const slice = picked.slice(d * DECK_SIZE, (d + 1) * DECK_SIZE)
    const deck = {
      slug: `${code}-${level.toLowerCase()}-sentences-${d + 1}`,
      title: `Sentences ${d + 1}`,
      description: `Everyday ${meta.name} sentences with English meanings.`,
      level, topic: 'sentences', order: 100 + d, answerTolerance: 'lenient',
      cards: slice.map((p) => ({ term: p.t, translation: p.e, partOfSpeech: 'sentence', tags: ['sentences'] })),
    }
    writeFileSync(path.join(outDir, `sentences-${String(d + 1).padStart(2, '0')}.json`), JSON.stringify(deck, null, 2) + '\n')
  }
  console.log(`${code}: ${pairs.length} usable pairs -> ${total} decks in ${outDir}/`)
}
