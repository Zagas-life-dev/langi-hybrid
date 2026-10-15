/**
 * Seed the grammar concept question bank. Run from the langi/ root:
 *     npm run seed-grammar-questions
 *
 * Reads data/french/grammar-questions.json and:
 *   1. upserts every question into the GrammarQuestion bank (used by the
 *      grammar-concept practice review), and
 *   2. upserts the `placement: true` questions into PlacementQuestion as kind
 *      'grammar', so the placement test measures grammar at every level.
 *
 * Idempotent: questions are keyed by (languageCode, prompt).
 */
import * as dotenv from 'dotenv'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import mongoose from 'mongoose'
import GrammarQuestion from '../lib/models/GrammarQuestion'
import PlacementQuestion from '../lib/models/PlacementQuestion'
import type { CefrLevel } from '../lib/models/LangiUser'
import { resolveLang } from './_lang'

dotenv.config({ path: '.env.local' })

const { lang: LANG, dir: LANG_DIR } = resolveLang()

interface RawQ {
  level: CefrLevel
  concept?: string
  prompt: string
  options: string[]
  answerIndex: number
  explanation?: string
  placement?: boolean
}

function validate(qs: RawQ[]): void {
  const seen = new Set<string>()
  for (const q of qs) {
    if (!q.prompt || !Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Bad question (missing prompt/options): ${q.prompt}`)
    }
    if (q.answerIndex < 0 || q.answerIndex >= q.options.length) {
      throw new Error(`answerIndex out of range: ${q.prompt}`)
    }
    if (seen.has(q.prompt)) throw new Error(`Duplicate prompt: ${q.prompt}`)
    seen.add(q.prompt)
  }
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set (check .env.local)')

  const file = path.join(process.cwd(), 'data', LANG_DIR, 'grammar-questions.json')
  const data = JSON.parse(readFileSync(file, 'utf8')) as { questions: RawQ[] }
  const questions = data.questions
  validate(questions)

  await mongoose.connect(uri)
  console.log('Connected to', mongoose.connection.name)

  // 1. Grammar concept bank.
  const bankOps = questions.map((q) => ({
    updateOne: {
      filter: { languageCode: LANG, prompt: q.prompt },
      update: {
        $set: {
          languageCode: LANG,
          level: q.level,
          concept: q.concept ?? '',
          options: q.options,
          answerIndex: q.answerIndex,
          explanation: q.explanation ?? '',
          placement: !!q.placement,
        },
      },
      upsert: true,
    },
  }))
  await GrammarQuestion.bulkWrite(bankOps)

  // 2. Placement test (grammar items only).
  const placementQs = questions.filter((q) => q.placement)
  const placementOps = placementQs.map((q) => ({
    updateOne: {
      filter: { languageCode: LANG, prompt: q.prompt },
      update: {
        $set: { languageCode: LANG, level: q.level, kind: 'grammar' as const, options: q.options, answerIndex: q.answerIndex },
      },
      upsert: true,
    },
  }))
  if (placementOps.length) await PlacementQuestion.bulkWrite(placementOps)

  const byLevel: Record<string, number> = {}
  for (const q of questions) byLevel[q.level] = (byLevel[q.level] || 0) + 1
  console.log('\nGrammar question bank by level:')
  for (const [lvl, n] of Object.entries(byLevel).sort()) console.log(`  ${lvl}: ${n}`)
  console.log(`\nSeeded ${questions.length} grammar questions (${placementQs.length} also added to the placement test).`)

  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
