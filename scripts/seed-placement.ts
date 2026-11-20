/**
 * Load only the placement-test questions for one language (data/<lang>/placement.json) into Firestore.
 * Cheap: use it after changing a question bank, instead of re-seeding every card.
 *
 *     npx tsx --env-file=.env.local scripts/seed-placement.ts yo
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import PlacementQuestion from '../lib/models/PlacementQuestion'
import { resolveLang } from './_lang'

async function main() {
  const { lang, dir } = resolveLang()
  const file = path.join(process.cwd(), 'data', dir, 'placement.json')
  const { questions } = JSON.parse(readFileSync(file, 'utf8')) as {
    questions: { level: string; kind: string; prompt: string; options: string[]; answerIndex: number }[]
  }
  console.log('Writing to Firestore project', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  const res = await PlacementQuestion.bulkWrite(
    questions.map((q) => ({
      updateOne: {
        filter: { languageCode: lang, prompt: q.prompt },
        update: { $set: { languageCode: lang, level: q.level, kind: q.kind, options: q.options, answerIndex: q.answerIndex } },
        upsert: true,
      },
    })),
  )
  console.log(`${lang}: ${questions.length} placement questions (${res.upsertedCount} new, ${res.matchedCount} updated)`)
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
