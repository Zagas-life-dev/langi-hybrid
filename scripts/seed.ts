/**
 * Idempotent curated-content seeder. Run from the langi/ root:
 *     npm run seed            # French (default)
 *     npm run seed -- es      # Spanish
 *
 * Loads .env.local, connects to the `langi` Mongo database, and upserts the
 * Language, every Deck (by slug), and every Card (by deckId+term) from
 * data/<lang>/*.json. Re-running is safe — it never wipes AI-enriched fields
 * (exampleSentence / distractors) because those aren't part of the $set.
 */
import * as dotenv from 'dotenv'
import path from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import Language from '../lib/models/Language'
import Deck from '../lib/models/Deck'
import Card from '../lib/models/Card'
import PlacementQuestion from '../lib/models/PlacementQuestion'
import StoryTemplate from '../lib/models/StoryTemplate'
import type { CefrLevel } from '../lib/models/LangiUser'
import { langMeta } from '../lib/langs'
import { resolveLang } from './_lang'

dotenv.config({ path: '.env.local' })

const { lang: LANG, dir: LANG_DIR } = resolveLang()

const MIN_PER_DECK = 50
const MIN_TOTAL = 600

type SeedCard = {
  term: string
  translation: string
  partOfSpeech?: string
  gender?: string
  acceptedAnswers?: string[]
  answerTolerance?: 'lenient' | 'strict'
  tags?: string[]
}
type SeedDeck = {
  slug: string
  title: string
  description: string
  level: string
  topic: string
  order: number
  answerTolerance: 'lenient' | 'strict'
  cards: SeedCard[]
}
type SeedPlacement = {
  questions: {
    level: CefrLevel
    kind: 'vocab' | 'grammar' | 'reading'
    prompt: string
    options: string[]
    answerIndex: number
  }[]
}
type SeedStory = {
  slug: string
  level: CefrLevel
  topic: string
  title: string
  titleTranslation: string
  sentences: { text: string; translation: string }[]
  glossary: { term: string; translation: string }[]
  questions: { question: string; options: string[]; answer: number }[]
}

function cleanSet(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out
}

async function main() {
  console.log('Writing to Firestore project', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)

  await Promise.all([Deck.createIndexes(), Card.createIndexes(), PlacementQuestion.createIndexes()])

  // --- Language ---
  const meta = langMeta(LANG)
  await Language.findOneAndUpdate(
    { code: LANG },
    { $set: { name: meta.name, nativeName: meta.nativeName, flag: meta.flag, available: true } },
    { upsert: true }
  )

  // --- Decks + Cards ---
  const dir = path.join(process.cwd(), 'data', LANG_DIR)
  const files = readdirSync(dir).filter((f) => /^\d.*\.json$/.test(f)).sort()

  let total = 0
  const report: { slug: string; level: string; count: number }[] = []

  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as SeedDeck
    const deck = await Deck.findOneAndUpdate(
      { slug: data.slug },
      {
        $set: {
          languageCode: LANG,
          title: data.title,
          description: data.description,
          level: data.level,
          topic: data.topic,
          order: data.order,
          isSystem: true,
          answerTolerance: data.answerTolerance || 'lenient',
        },
      },
      { upsert: true, returnDocument: 'after' }
    )

    // Dedupe by term within the deck so the count is honest.
    const seen = new Set<string>()
    const cards = data.cards.filter((c) => (seen.has(c.term) ? false : (seen.add(c.term), true)))

    const ops = cards.map((c) => ({
      updateOne: {
        filter: { deckId: deck!._id, term: c.term },
        update: {
          $set: cleanSet({
            languageCode: LANG,
            translation: c.translation,
            partOfSpeech: c.partOfSpeech,
            gender: c.gender,
            acceptedAnswers: c.acceptedAnswers || [],
            answerTolerance: c.answerTolerance,
            tags: c.tags || [],
          }),
        },
        upsert: true,
      },
    }))
    if (ops.length) await Card.bulkWrite(ops)

    total += cards.length
    report.push({ slug: data.slug, level: data.level, count: cards.length })
    if (cards.length < MIN_PER_DECK) {
      console.warn(`  ⚠ ${data.slug}: only ${cards.length} cards (min ${MIN_PER_DECK})`)
    }
  }

  // --- Placement question bank (optional file; added in phase 3) ---
  let placementCount = 0
  try {
    const pfile = path.join(dir, 'placement.json')
    const pdata = JSON.parse(readFileSync(pfile, 'utf8')) as SeedPlacement
    const ops = pdata.questions.map((q) => ({
      updateOne: {
        filter: { languageCode: LANG, prompt: q.prompt },
        update: {
          $set: { languageCode: LANG, level: q.level, kind: q.kind, options: q.options, answerIndex: q.answerIndex },
        },
        upsert: true,
      },
    }))
    if (ops.length) await PlacementQuestion.bulkWrite(ops)
    placementCount = pdata.questions.length
  } catch {
    // placement.json not present yet — skipped.
  }

  // --- Curated graded-reader stories (data/french/stories/*.json) ---
  let storyCount = 0
  try {
    const sdir = path.join(dir, 'stories')
    const sfiles = readdirSync(sdir).filter((f) => f.endsWith('.json')).sort()
    await StoryTemplate.createIndexes()
    const ops: Parameters<typeof StoryTemplate.bulkWrite>[0] = []
    for (const file of sfiles) {
      const stories = JSON.parse(readFileSync(path.join(sdir, file), 'utf8')) as SeedStory[]
      stories.forEach((s, i) => {
        ops.push({
          updateOne: {
            filter: { slug: s.slug },
            update: {
              $set: {
                languageCode: LANG,
                level: s.level,
                topic: s.topic,
                title: s.title,
                titleTranslation: s.titleTranslation,
                sentences: s.sentences,
                glossary: s.glossary,
                questions: s.questions,
                order: i,
              },
            },
            upsert: true,
          },
        })
      })
    }
    if (ops.length) await StoryTemplate.bulkWrite(ops)
    storyCount = ops.length
  } catch {
    // stories/ folder not present — skipped.
  }

  console.log('\n  Deck                         Level   Cards')
  console.log('  ' + '-'.repeat(44))
  for (const r of report) {
    console.log('  ' + r.slug.padEnd(28) + ' ' + r.level.padEnd(6) + ' ' + String(r.count).padStart(5))
  }
  console.log('  ' + '-'.repeat(44))
  console.log(`  ${report.length} decks · ${total} cards · ${placementCount} placement questions · ${storyCount} stories\n`)

  if (total < MIN_TOTAL) {
    throw new Error(`Seed has only ${total} cards — below the pinned minimum of ${MIN_TOTAL}.`)
  }
  console.log('✓ Seed complete (minimums satisfied).')
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
