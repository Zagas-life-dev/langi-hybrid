/**
 * Live check of what common app actions cost in Firestore reads/writes. Creates one throwaway user and deletes it.
 * Run: npx tsx --env-file=.env.local scripts/_selftest-cost.ts
 */
import { ensureDbUser } from '../lib/userStore'
import Deck from '../lib/models/Deck'
import Card from '../lib/models/Card'
import UserCard from '../lib/models/UserCard'
import ReviewLog from '../lib/models/ReviewLog'
import DailyActivity from '../lib/models/DailyActivity'
import LangiUser from '../lib/models/LangiUser'
import { getBackend } from '../lib/db/backend'

type Usage = { reads: number; writes: number }
const usage = () => ((globalThis as unknown as { __langiFsUsage?: Usage }).__langiFsUsage ?? { reads: 0, writes: 0 })

async function measure(label: string, fn: () => PromiseLike<unknown>, budget?: { reads?: number; writes?: number }) {
  const before = { ...usage() }
  await fn()
  const after = usage()
  const reads = after.reads - before.reads
  const writes = after.writes - before.writes
  const ok = (budget?.reads === undefined || reads <= budget.reads) && (budget?.writes === undefined || writes <= budget.writes)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${String(reads).padStart(4)} reads ${String(writes).padStart(3)} writes${budget ? `   (budget ${budget.reads ?? '-'} / ${budget.writes ?? '-'})` : ''}`)
  return ok
}

async function main() {
  const uid = `selftest-cost-${Date.now()}`
  let allOk = true
  const check = async (...a: Parameters<typeof measure>) => { allOk = (await measure(...a)) && allOk }

  await check('first sign-in: create the profile', () => ensureDbUser(uid, 'cost@example.com', { displayName: 'Cost' }), { reads: 3, writes: 2 })
  await check('returning user, checked on 10 requests in a row', async () => { for (let i = 0; i < 10; i++) await ensureDbUser(uid, 'cost@example.com') }, { reads: 10, writes: 0 })

  const user = (await ensureDbUser(uid, 'cost@example.com'))!
  const userId = String(user._id)

  // The review screen's reads: system decks, their cards, the learner's progress (cold, then warm).
  let deckIds: string[] = []
  await check('decks for a language (cold)', async () => { deckIds = (await Deck.find({ languageCode: 'fr', isSystem: true }).select('_id').lean()).map((d) => String(d._id)) }, { reads: 17 })
  await check('cards in those decks (cold, $in on deckId)', () => Card.find({ deckId: { $in: deckIds } }).select('_id deckId').lean(), { reads: 862 })
  await check('same decks + cards again (served from memory)', async () => {
    await Deck.find({ languageCode: 'fr', isSystem: true }).select('_id').lean()
    await Card.find({ deckId: { $in: deckIds } }).select('_id deckId').lean()
  }, { reads: 0, writes: 0 })

  // One review answer: progress row, log, daily counters, achievements counts.
  const cardId = (await Card.findOne({ deckId: deckIds[0] }).lean())!._id
  await check('one review answer (progress + log + daily + user)', async () => {
    await UserCard.updateOne({ userId, cardId: String(cardId) }, { $set: { box: 2, languageCode: 'fr' }, $inc: { reps: 1 } }, { upsert: true })
    await ReviewLog.create({ userId, cardId: String(cardId), result: 'correct', boxBefore: 1, boxAfter: 2 })
    await DailyActivity.findOneAndUpdate({ userId, date: '2026-11-20' }, { $inc: { reviews: 1, xp: 10 } }, { upsert: true, returnDocument: 'after' })
    await LangiUser.updateOne({ _id: userId }, { $inc: { xp: 10 } })
  }, { reads: 5, writes: 4 })
  await check('achievement counts after an answer (6 counts)', async () => {
    await Promise.all([
      ReviewLog.countDocuments({ userId }),
      UserCard.countDocuments({ userId, box: 5 }),
      DailyActivity.countDocuments({ userId, goalMet: true }),
    ])
  }, { reads: 3 })

  // Clean up everything this run created.
  const b = await getBackend()
  for (const [coll, model] of [['userCards', UserCard], ['reviewLogs', ReviewLog], ['dailyActivities', DailyActivity]] as const) {
    const rows = await (model as unknown as { find: (f: object) => PromiseLike<{ _id: string }[]> }).find({ userId })
    await b.delMany(coll, rows.map((r) => String(r._id)))
  }
  await b.del('users', userId)
  console.log(allOk ? '\nAll within budget. Test data cleaned up.' : '\nSome actions cost more than budgeted.')
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
