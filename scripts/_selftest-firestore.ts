/**
 * Live check of the Firestore model layer (lib/db). Writes to a throwaway `_selftest_*` collection and
 * deletes everything it made. Run: npx tsx --env-file=.env.local scripts/_selftest-firestore.ts
 */
import { defineModel, DuplicateKeyError, type Document } from '../lib/db/model'
import { getBackend } from '../lib/db/backend'

interface IT extends Document { owner: string; name: string; score: number; tags: string[]; when?: Date }
interface IK extends Document { userId: string; cardId: string; hits: number; box: number }

const stamp = Date.now()
const Thing = defineModel<IT>({ collection: `_selftest_things_${stamp}`, timestamps: true, indexed: ['owner'], defaults: () => ({ score: 0, tags: [] }) })
const Keyed = defineModel<IK>({ collection: `_selftest_keyed_${stamp}`, key: ['userId', 'cardId'], indexed: ['userId'], defaults: { hits: 0, box: 1 } })

let pass = 0
let fail = 0
function check(label: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
  if (ok) pass++
  else fail++
}

async function main() {
  // create + defaults + timestamps + Date round trip
  const when = new Date('2026-11-20T10:00:00Z')
  const a = await Thing.create({ owner: 'u1', name: 'a', when })
  check('create fills defaults and timestamps', a.score === 0 && Array.isArray(a.tags) && a.createdAt instanceof Date)
  const back = await Thing.findById(a._id)
  check('findById returns it, Dates come back as Dates', back?.name === 'a' && back.when instanceof Date && back.when.getTime() === when.getTime(), String(back?.when))

  // find: filter / sort / limit / lean / select
  await Thing.create([{ owner: 'u1', name: 'b', score: 5 }, { owner: 'u2', name: 'c', score: 9 }])
  const sorted = await Thing.find({ owner: 'u1' }).sort({ score: -1 })
  check('find + sort descending', sorted.map((x) => x.name).join() === 'b,a', sorted.map((x) => x.name).join())
  const gte = await Thing.find({ score: { $gte: 5 } }).sort('name').lean()
  check('range filter evaluated in memory', gte.map((x) => x.name).join() === 'b,c')
  const sel = await Thing.findOne({ name: 'c' }).select('name').lean()
  check('select + lean', !!sel && 'name' in sel && !('owner' in sel))

  // updates, $inc, save() diff
  await Thing.updateOne({ _id: a._id }, { $inc: { score: 10 }, $push: { tags: 'x' } })
  const mine = (await Thing.findById(a._id))!
  check('$inc and $push applied', mine.score === 10 && mine.tags.join() === 'x')
  await Thing.updateOne({ _id: a._id }, { $inc: { score: 1 } }) // concurrent change
  mine.name = 'renamed'
  await mine.save()
  const after = (await Thing.findById(a._id))!
  check('save() keeps a concurrent $inc', after.name === 'renamed' && after.score === 11, `score=${after.score}`)

  // keyed model: duplicate, upsert atomic, direct lookup
  await Keyed.create({ userId: 'u', cardId: 'c/1' })
  let dup = false
  try { await Keyed.create({ userId: 'u', cardId: 'c/1' }) } catch (e) { dup = e instanceof DuplicateKeyError }
  check('duplicate key is rejected (id with a slash works)', dup)
  const r = await Promise.all([1, 2, 3, 4, 5].map(() => Keyed.updateOne({ userId: 'u', cardId: 'c/2' }, { $inc: { hits: 1 } }, { upsert: true })))
  const k2 = await Keyed.findOne({ userId: 'u', cardId: 'c/2' })
  check('5 parallel upserts make ONE doc with hits=5, exactly one reports the insert', k2?.hits === 5 && (await Keyed.countDocuments({ userId: 'u' })) === 2 && r.filter((x) => x.upsertedCount).length === 1, `hits=${k2?.hits} inserted=${r.filter((x) => x.upsertedCount).length}`)

  // bulkWrite (seeding path): create new, merge into existing without wiping other fields
  await Keyed.updateOne({ userId: 'u', cardId: 'seed1' }, { $set: { box: 4 }, $inc: { hits: 3 } }, { upsert: true })
  const res = await Keyed.bulkWrite([
    { updateOne: { filter: { userId: 'u', cardId: 'seed1' }, update: { $set: { box: 2 } }, upsert: true } },
    { updateOne: { filter: { userId: 'u', cardId: 'seed2' }, update: { $set: { box: 3 } }, upsert: true } },
  ])
  const s1 = await Keyed.findOne({ userId: 'u', cardId: 'seed1' })
  const s2 = await Keyed.findOne({ userId: 'u', cardId: 'seed2' })
  check('bulkWrite creates new and merges existing', res.upsertedCount === 1 && s1?.box === 2 && s1.hits === 3 && s2?.box === 3 && s2.hits === 0, JSON.stringify(res))

  // delete + aggregate
  const agg = await Thing.aggregate<{ _id: string; total: number }>([{ $group: { _id: '$owner', total: { $sum: '$score' } } }, { $sort: { total: -1 } }])
  check('aggregate group/sum', agg[0]?._id === 'u1' && agg[0].total === 16 && agg[1]?.total === 9, JSON.stringify(agg))
  check('deleteMany', (await Thing.deleteMany({ owner: 'u1' })).deletedCount === 2)

  // clean up everything this run created
  const b = await getBackend()
  for (const c of [`_selftest_things_${stamp}`, `_selftest_keyed_${stamp}`]) {
    const docs = await b.scan(c)
    await b.delMany(c, docs.map((d) => d.id))
  }
  console.log(`\n${pass} passed, ${fail} failed. Test collections cleaned up.`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('ERROR', e); process.exit(1) })
