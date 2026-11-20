import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, setBackend } from '@/lib/db/backend'
import { defineModel, DuplicateKeyError, type Document } from '@/lib/db/model'

interface IThing extends Document { owner: string; name: string; score: number; tags: string[]; note?: string }
interface IUC extends Document { userId: string; cardId: string; box: number; hits: number }

const Thing = defineModel<IThing>({
  collection: 'things', timestamps: true, indexed: ['owner'],
  defaults: () => ({ score: 0, tags: [] }),
})
const UC = defineModel<IUC>({ collection: 'ucs', key: ['userId', 'cardId'], indexed: ['userId'], defaults: { box: 1, hits: 0 } })

let mem: MemoryBackend
beforeEach(() => { mem = new MemoryBackend(); setBackend(mem) })

describe('create and read', () => {
  it('fills defaults and timestamps, and returns a document with an id', async () => {
    const t = await Thing.create({ owner: 'u1', name: 'a' })
    expect(typeof t._id).toBe('string')
    expect(t.score).toBe(0)
    expect(t.tags).toEqual([])
    expect(t.createdAt).toBeInstanceOf(Date)
    const back = await Thing.findById(t._id)
    expect(back?.name).toBe('a')
  })

  it('findById with junk returns null', async () => {
    expect(await Thing.findById(undefined)).toBeNull()
    expect(await Thing.findById('nope')).toBeNull()
  })

  it('find filters, sorts, skips, limits, selects and can be lean', async () => {
    await Thing.create([{ owner: 'u1', name: 'b', score: 2 }, { owner: 'u1', name: 'a', score: 3 }, { owner: 'u2', name: 'c', score: 1 }, { owner: 'u1', name: 'd', score: 1 }])
    const names = async (q: PromiseLike<IThing[]>) => (await q).map((x) => x.name)
    expect(await names(Thing.find({ owner: 'u1' }).sort({ score: -1 }))).toEqual(['a', 'b', 'd'])
    expect(await names(Thing.find({ owner: 'u1' }).sort('name').skip(1).limit(1))).toEqual(['b'])
    expect(await names(Thing.find({ score: { $gte: 2 } }).sort('name'))).toEqual(['a', 'b'])
    const lean = await Thing.find({ owner: 'u2' }).select('name').lean()
    expect(lean).toEqual([{ _id: expect.any(String), name: 'c' }])
    expect((lean[0] as unknown as { save?: unknown }).save).toBeUndefined()
  })

  it('find by _id $in returns just those documents', async () => {
    const [a, b] = await Thing.create([{ owner: 'u', name: 'a' }, { owner: 'u', name: 'b' }])
    await Thing.create({ owner: 'u', name: 'c' })
    const got = await Thing.find({ _id: { $in: [a._id, b._id] } })
    expect(got.map((x) => x.name).sort()).toEqual(['a', 'b'])
  })

  it('collation matches case-insensitively', async () => {
    await Thing.create({ owner: 'u', name: 'Pain' })
    expect(await Thing.findOne({ name: 'pain' })).toBeNull()
    expect((await Thing.findOne({ name: 'pain' }).collation({ locale: 'fr', strength: 2 }))?.name).toBe('Pain')
  })
})

describe('keys, upsert and duplicates', () => {
  it('a keyed model rejects a duplicate with the Mongo duplicate-key code', async () => {
    await UC.create({ userId: 'u', cardId: 'c' })
    await expect(UC.create({ userId: 'u', cardId: 'c' })).rejects.toBeInstanceOf(DuplicateKeyError)
    await expect(UC.create({ userId: 'u', cardId: 'c' })).rejects.toMatchObject({ code: 11000 })
  })

  it('upsert inserts once, then updates, and $setOnInsert only applies on insert', async () => {
    const r1 = await UC.updateOne({ userId: 'u', cardId: 'c' }, { $inc: { hits: 1 }, $setOnInsert: { box: 4 } }, { upsert: true })
    expect(r1.upsertedCount).toBe(1)
    const r2 = await UC.updateOne({ userId: 'u', cardId: 'c' }, { $inc: { hits: 1 }, $setOnInsert: { box: 9 } }, { upsert: true })
    expect(r2.upsertedCount).toBe(0)
    const doc = await UC.findOne({ userId: 'u', cardId: 'c' })
    expect(doc).toMatchObject({ hits: 2, box: 4 })
    expect(mem.size('ucs')).toBe(1)
  })

  it('findOneAndUpdate with upsert returns the new document when asked', async () => {
    const doc = await UC.findOneAndUpdate({ userId: 'u', cardId: 'c' }, { $set: { box: 3 } }, { upsert: true, returnDocument: 'after' })
    expect(doc?.box).toBe(3)
    const before = await UC.findOneAndUpdate({ userId: 'u', cardId: 'c' }, { $set: { box: 5 } })
    expect(before?.box).toBe(3)
    expect((await UC.findOne({ userId: 'u', cardId: 'c' }))?.box).toBe(5)
  })

  it('non-matching update without upsert does nothing', async () => {
    const r = await Thing.updateOne({ owner: 'ghost' }, { $set: { name: 'x' } })
    expect(r.matchedCount).toBe(0)
    expect(await Thing.countDocuments()).toBe(0)
  })
})

describe('updates and save()', () => {
  it('updateMany touches every match', async () => {
    await Thing.create([{ owner: 'u', name: 'a' }, { owner: 'u', name: 'b' }, { owner: 'z', name: 'c' }])
    const r = await Thing.updateMany({ owner: 'u' }, { $inc: { score: 5 } })
    expect(r.matchedCount).toBe(2)
    expect((await Thing.find({ owner: 'u' })).map((x) => x.score)).toEqual([5, 5])
    expect((await Thing.findOne({ owner: 'z' }))?.score).toBe(0)
  })

  it('save() writes only changed fields, so a concurrent $inc is not lost', async () => {
    const t = await Thing.create({ owner: 'u', name: 'a' })
    const mine = (await Thing.findById(t._id))!
    await Thing.updateOne({ _id: t._id }, { $inc: { score: 10 } }) // someone else, meanwhile
    mine.name = 'renamed'
    await mine.save()
    const after = await Thing.findById(t._id)
    expect(after?.name).toBe('renamed')
    expect(after?.score).toBe(10)
  })

  it('save() persists pushes into arrays and field removal', async () => {
    const t = await Thing.create({ owner: 'u', name: 'a', note: 'x' })
    t.tags.push('one')
    delete t.note
    await t.save()
    const back = await Thing.findById(t._id)
    expect(back?.tags).toEqual(['one'])
    expect(back?.note).toBeUndefined()
  })

  it('save() on a document loaded with select() does not wipe the other fields', async () => {
    const t = await Thing.create({ owner: 'u', name: 'keep', score: 7 })
    const partial = (await Thing.findById(t._id).select('owner'))!
    partial.owner = 'v'
    await partial.save()
    expect(await Thing.findById(t._id)).toMatchObject({ owner: 'v', name: 'keep', score: 7 })
  })

  it('updatedAt moves forward on update', async () => {
    const t = await Thing.create({ owner: 'u', name: 'a' })
    await new Promise((r) => setTimeout(r, 5))
    await Thing.updateOne({ _id: t._id }, { $set: { name: 'b' } })
    const back = await Thing.findById(t._id)
    expect(back!.updatedAt!.getTime()).toBeGreaterThan(t.createdAt!.getTime())
  })
})

describe('delete, count, distinct, exists, aggregate', () => {
  it('deleteOne, deleteMany and the document deleteOne()', async () => {
    const [a] = await Thing.create([{ owner: 'u', name: 'a' }, { owner: 'u', name: 'b' }, { owner: 'z', name: 'c' }])
    expect((await Thing.deleteOne({ name: 'b' })).deletedCount).toBe(1)
    expect((await Thing.deleteMany({ owner: 'z' })).deletedCount).toBe(1)
    await a.deleteOne()
    expect(await Thing.countDocuments()).toBe(0)
  })

  it('countDocuments, distinct and exists', async () => {
    await Thing.create([{ owner: 'u', name: 'a', tags: ['x', 'y'] }, { owner: 'u', name: 'b', tags: ['y'] }, { owner: 'z', name: 'c' }])
    expect(await Thing.countDocuments({ owner: 'u' })).toBe(2)
    expect((await Thing.distinct<string>('tags')).sort()).toEqual(['x', 'y'])
    expect(await Thing.exists({ owner: 'z' })).toEqual({ _id: expect.any(String) })
    expect(await Thing.exists({ owner: 'nobody' })).toBeNull()
  })

  it('aggregate groups and sorts', async () => {
    await Thing.create([{ owner: 'u', name: 'a', score: 4 }, { owner: 'u', name: 'b', score: 6 }, { owner: 'z', name: 'c', score: 1 }])
    const out = await Thing.aggregate<{ _id: string; total: number }>([{ $group: { _id: '$owner', total: { $sum: '$score' } } }, { $sort: { total: -1 } }])
    expect(out).toEqual([{ _id: 'u', total: 10 }, { _id: 'z', total: 1 }])
  })
})
