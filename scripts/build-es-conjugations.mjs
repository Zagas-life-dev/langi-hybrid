// Transform the Fred Jehle Spanish verb database (public domain) into the compact
// per-verb conjugation JSON the Spanish grammar seeder consumes. We keep only the
// verbs the lessons reference and only the tenses they teach (A1–B2).
//
// Fetch the source CSV, then build:
//   curl -sL -o /tmp/jehle.csv \
//     https://raw.githubusercontent.com/ghidinelli/fred-jehle-spanish-verbs/master/jehle_verb_database.csv
//   node scripts/build-es-conjugations.mjs /tmp/jehle.csv data/spanish/jehle-conjugations.json
//
// See data/spanish/jehle-conjugations.NOTICE.md for attribution.
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = process.argv[2]
const OUT = process.argv[3]

// Minimal CSV parser handling quoted fields with embedded commas/quotes.
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// Verbs the lessons need (infinitives + reflexive bases).
const WANT = new Set([
  // regular models
  'hablar', 'comer', 'vivir',
  // high-frequency irregulars / stem-changers
  'ser', 'estar', 'haber', 'tener', 'ir', 'hacer', 'poder', 'querer', 'decir',
  'poner', 'venir', 'ver', 'dar', 'saber', 'salir', 'conocer', 'pensar',
  'volver', 'sentir', 'pedir', 'dormir', 'jugar', 'empezar', 'entender',
  'cerrar', 'contar', 'encontrar', 'seguir', 'traer', 'caer', 'oír', 'leer',
  'creer', 'conducir', 'producir',
  // verbs with the gustar-type "backwards" construction
  'gustar', 'encantar',
  // common regulars used in examples/drills
  'trabajar', 'estudiar', 'comprar', 'tomar', 'llegar', 'pasar', 'quedar',
  'mirar', 'escuchar', 'bailar', 'cantar', 'cocinar', 'viajar', 'caminar',
  'beber', 'aprender', 'leer', 'correr', 'comprender', 'vender',
  'escribir', 'abrir', 'recibir', 'subir', 'decidir',
  // reflexive bases (pronoun added by the seeder)
  'llamar', 'levantar', 'duchar', 'acostar', 'despertar', 'vestir', 'lavar',
  'sentar', 'peinar', 'casar', 'mover',
])

const text = readFileSync(SRC, 'utf8')
const rows = parseCSV(text)
const header = rows[0]
const col = Object.fromEntries(header.map((h, i) => [h, i]))

// tense map: (mood, tense) -> our key
const TKEY = {
  'Indicativo|Presente': 'pres',
  'Indicativo|Pretérito': 'pret',
  'Indicativo|Imperfecto': 'imp',
  'Indicativo|Futuro': 'fut',
  'Indicativo|Condicional': 'cond',
  'Subjuntivo|Presente': 'sub',
}

const out = {}
for (let r = 1; r < rows.length; r++) {
  const row = rows[r]
  if (!row || row.length < header.length) continue
  const inf = row[col['infinitive']]
  if (!WANT.has(inf)) continue
  const key = `${row[col['mood']]}|${row[col['tense']]}`
  const tkey = TKEY[key]
  const e = (out[inf] ||= { english: row[col['infinitive_english']] })
  // gerund + participle (same across tense rows; set once)
  if (!e.ger) e.ger = row[col['gerund']]
  if (!e.part) e.part = row[col['pastparticiple']]
  if (!tkey) continue
  e[tkey] = [
    row[col['form_1s']], row[col['form_2s']], row[col['form_3s']],
    row[col['form_1p']], row[col['form_2p']], row[col['form_3p']],
  ].map((s) => (s || '').trim())
}

// Verbs absent from the Jehle dataset, supplied verbatim from the RAE paradigm.
const SUPPLEMENT = {
  haber: {
    english: 'to have (auxiliary)', ger: 'habiendo', part: 'habido',
    pres: ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
    pret: ['hube', 'hubiste', 'hubo', 'hubimos', 'hubisteis', 'hubieron'],
    imp: ['había', 'habías', 'había', 'habíamos', 'habíais', 'habían'],
    fut: ['habré', 'habrás', 'habrá', 'habremos', 'habréis', 'habrán'],
    cond: ['habría', 'habrías', 'habría', 'habríamos', 'habríais', 'habrían'],
    sub: ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan'],
  },
  cantar: {
    english: 'to sing', ger: 'cantando', part: 'cantado',
    pres: ['canto', 'cantas', 'canta', 'cantamos', 'cantáis', 'cantan'],
    pret: ['canté', 'cantaste', 'cantó', 'cantamos', 'cantasteis', 'cantaron'],
    imp: ['cantaba', 'cantabas', 'cantaba', 'cantábamos', 'cantabais', 'cantaban'],
    fut: ['cantaré', 'cantarás', 'cantará', 'cantaremos', 'cantaréis', 'cantarán'],
    cond: ['cantaría', 'cantarías', 'cantaría', 'cantaríamos', 'cantaríais', 'cantarían'],
    sub: ['cante', 'cantes', 'cante', 'cantemos', 'cantéis', 'canten'],
  },
}
for (const [v, data] of Object.entries(SUPPLEMENT)) if (!out[v]) out[v] = data

// Report any wanted verb missing from the dataset, and sort keys for stable diffs.
const missing = [...WANT].filter((v) => !out[v])
const sorted = {}
for (const k of Object.keys(out).sort()) sorted[k] = out[k]
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n')
console.log(`Wrote ${Object.keys(sorted).length} verbs to ${OUT}`)
if (missing.length) console.log('MISSING from dataset:', missing.join(', '))
