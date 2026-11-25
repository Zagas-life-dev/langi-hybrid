/**
 * Seed the AI-drafted Yoruba / Igbo / Hausa A1 grammar lessons into Firestore.
 *     npm run seed-grammar-ng -- yo        (or ig, ha)
 *     npm run seed-grammar-ng -- yo --dry  (print only, no writes)
 *
 * Content lives in data/grammar-ng/<lang>.json and must match the catalog in lib/grammar.ts. Idempotent:
 * each lesson is upserted by slug. Writes only to the grammarLessons collection.
 */
import * as dotenv from 'dotenv'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import GrammarLesson from '../lib/models/GrammarLesson'
import { getCatalog } from '../lib/grammar'

dotenv.config({ path: '.env.local' })

const LANGS = ['yo', 'ig', 'ha']
const lang = (process.argv[2] || '').toLowerCase()
if (!LANGS.includes(lang)) {
  console.error(`Usage: seed-grammar-ng <${LANGS.join('|')}> [--dry]`)
  process.exit(1)
}
const DRY = process.argv.includes('--dry')

type Written = { slug: string; summary: string; explanation: string; examples: { fr: string; en: string }[]; drills: { prompt: string; answer: string; hint?: string }[] }
const data: { lessons: Written[] } = JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'grammar-ng', `${lang}.json`), 'utf8'))
const catalog = getCatalog(lang)

async function main() {
  const missing = catalog.filter((t) => !data.lessons.some((l) => l.slug === t.slug)).map((t) => t.slug)
  if (missing.length) throw new Error(`catalog topics with no lesson: ${missing.join(', ')}`)
  if (!DRY) console.log('Writing to Firestore project', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)

  let drills = 0
  for (const w of data.lessons) {
    const t = catalog.find((c) => c.slug === w.slug)
    if (!t) throw new Error(`"${w.slug}" is not in the ${lang} catalog`)
    if (w.drills.length === 0) throw new Error(`lesson ${w.slug} has no drills`)
    drills += w.drills.length
    if (DRY) { console.log(`  ok ${w.slug}: ${w.examples.length} examples, ${w.drills.length} drills`); continue }
    await GrammarLesson.findOneAndUpdate(
      { slug: w.slug },
      {
        $set: {
          languageCode: lang, slug: w.slug, level: t.level, title: t.title, topic: t.topic,
          order: catalog.indexOf(t), summary: w.summary, explanation: w.explanation,
          examples: w.examples, drills: w.drills, isSystem: true, generatedAt: new Date(),
        },
      },
      { upsert: true },
    )
    console.log(`  ✓ ${w.slug} (${w.drills.length} drills)`)
  }
  console.log(`\n${DRY ? 'Checked' : 'Seeded'} ${data.lessons.length} ${lang} lessons, ${drills} drills.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
