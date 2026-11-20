import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, setBackend } from '@/lib/db/backend'
import { defineModel, type Document } from '@/lib/db/model'
import { ensureDbUser } from '@/lib/userStore'

// Firestore meters reads and writes (free plan: 50,000 reads and 20,000 writes a day). These tests pin down how
// many database operations the common calls cost, so a change that makes them expensive fails here first.

interface IDeck extends Document { languageCode: string; slug: string }
interface ICard extends Document { deckId: string; term: string }
interface ILog extends Document { userId: string; result: string }
interface IUC extends Document { userId: string; cardId: string; box: number; hits: number }

const Deck = defineModel<IDeck>({ collection: 'cost_decks', indexed: ['languageCode'], cacheMs: 60_000 })
const Card = defineModel<ICard>({ collection: 'cost_cards', indexed: ['deckId'], cacheMs: 60_000 })
const Log = defineModel<ILog>({ collection: 'cost_logs', indexed: ['userId'] })
const UC = defineModel<IUC>({ collection: 'cost_ucs', key: ['userId', 'cardId'], indexed: ['userId'], plain: ['box'], defaults: { box: 1, hits: 0 } })

type Counts = { get: number; scan: number; count: number; mutate: number; put: number }
let mem: MemoryBackend
let c: Counts
const scans: Record<string, unknown>[] = []

beforeEach(() => {
  mem = new MemoryBackend()
  c = { get: 0, scan: 0, count: 0, mutate: 0, put: 0 }
  scans.length = 0
  const wrap = <K extends keyof MemoryBackend>(name: K, key: keyof Counts, onCall?: (args: unknown[]) => void) => {
    const real = (mem[name] as unknown as (...a: unknown[]) => unknown).bind(mem)
    ;(mem as unknown as Record<string, unknown>)[name as string] = (...args: unknown[]) => { c[key]++; onCall?.(args); return real(...args) }
  }
  wrap('get', 'get')
  wrap('scan', 'scan', (a) => scans.push((a[1] ?? {}) as Record<string, unknown>))
  wrap('count', 'count')
  wrap('mutate', 'mutate')
  wrap('put', 'put')
  setBackend(mem)
  // The cache is shared on globalThis between models; start each test cold.
  ;(globalThis as unknown as { __langiScanCaches?: Map<string, Map<string, unknown>> }).__langiScanCaches?.forEach((m) => m.clear())
})

describe('reads', () => {
  it('an $in on an indexed field reads only those values, not the whole collection', async () => {
    await Card.create([{ deckId: 'd1', term: 'a' }, { deckId: 'd2', term: 'b' }, { deckId: 'd3', term: 'c' }])
    scans.length = 0
    const got = await Card.find({ deckId: { $in: ['d1', 'd3'] } })
    expect(got.map((x) => x.term).sort()).toEqual(['a', 'c'])
    expect(scans).toEqual([{ deckId: ['d1', 'd3'] }])
  })

  it('an $in with no values reads nothing', async () => {
    await Card.create({ deckId: 'd1', term: 'a' })
    c.scan = 0
    expect(await Card.find({ deckId: { $in: [] } })).toEqual([])
    expect(c.scan).toBe(0)
  })

  it('static content is read once, then served from memory', async () => {
    await Deck.create([{ languageCode: 'fr', slug: 'a' }, { languageCode: 'fr', slug: 'b' }])
    c.scan = 0
    for (let i = 0; i < 5; i++) await Deck.find({ languageCode: 'fr' })
    expect(c.scan).toBe(1)
  })

  it('a write to an unrelated value keeps the cache; a write to the same value clears it', async () => {
    await Deck.create([{ languageCode: 'fr', slug: 'a' }, { languageCode: 'es', slug: 'x' }])
    await Deck.find({ languageCode: 'fr' })
    c.scan = 0
    await Deck.create({ languageCode: 'es', slug: 'y' }) // different language
    await Deck.find({ languageCode: 'fr' })
    expect(c.scan).toBe(0)
    await Deck.create({ languageCode: 'fr', slug: 'b' }) // same language
    expect((await Deck.find({ languageCode: 'fr' })).length).toBe(2)
    expect(c.scan).toBe(1)
  })
})

describe('counting', () => {
  it('equality counts use the cheap count query, never reading the documents', async () => {
    await Log.create([{ userId: 'u', result: 'ok' }, { userId: 'u', result: 'no' }, { userId: 'v', result: 'ok' }])
    c.scan = 0
    expect(await Log.countDocuments({ userId: 'u' })).toBe(2)
    expect(c.count).toBe(1)
    expect(c.scan).toBe(0)
  })

  it('"plain" fields count that way too, while other filters still work', async () => {
    await UC.create([{ userId: 'u', cardId: 'a', box: 5 }, { userId: 'u', cardId: 'b', box: 2 }, { userId: 'u', cardId: 'c', box: 5 }])
    c.scan = 0
    c.count = 0
    expect(await UC.countDocuments({ userId: 'u', box: 5 })).toBe(2)
    expect(c.count).toBe(1)
    expect(c.scan).toBe(0)
    expect(await UC.countDocuments({ userId: 'u', box: { $gte: 2 } })).toBe(3) // a range cannot use it, still correct
  })
})

describe('writes', () => {
  it('updating by key skips the pre-read: one transaction, no scan', async () => {
    await UC.create({ userId: 'u', cardId: 'a' })
    c.get = 0; c.scan = 0; c.mutate = 0
    await UC.updateOne({ userId: 'u', cardId: 'a' }, { $inc: { hits: 1 } })
    expect(c).toMatchObject({ get: 0, scan: 0, mutate: 1 })
    expect((await UC.findOne({ userId: 'u', cardId: 'a' }))?.hits).toBe(1)
  })

  it('updating by _id is also one transaction', async () => {
    const l = await Log.create({ userId: 'u', result: 'ok' })
    c.get = 0; c.scan = 0; c.mutate = 0
    await Log.updateOne({ _id: l._id }, { $set: { result: 'no' } })
    expect(c).toMatchObject({ get: 0, scan: 0, mutate: 1 })
  })

  it('an upsert by key still inserts when nothing exists', async () => {
    const r = await UC.updateOne({ userId: 'u', cardId: 'z' }, { $inc: { hits: 1 } }, { upsert: true })
    expect(r.upsertedCount).toBe(1)
    expect((await UC.findOne({ userId: 'u', cardId: 'z' }))?.hits).toBe(1)
  })

  it('a filter that does not match is not updated', async () => {
    await UC.create({ userId: 'u', cardId: 'a', box: 1 })
    const r = await UC.updateOne({ userId: 'u', cardId: 'a', box: 4 }, { $set: { hits: 9 } })
    expect(r.matchedCount).toBe(0)
    expect((await UC.findOne({ userId: 'u', cardId: 'a' }))?.hits).toBe(0)
  })

  it('save() with nothing changed does not touch the database', async () => {
    const l = await Log.create({ userId: 'u', result: 'ok' })
    const doc = (await Log.findById(l._id))!
    c.mutate = 0; c.put = 0
    await doc.save()
    expect(c.mutate + c.put).toBe(0)
    doc.result = 'no'
    await doc.save()
    expect(c.mutate).toBe(1)
  })
})

describe('the signed-in user check, which runs on every request', () => {
  it('costs one read and no write for a returning user', async () => {
    await ensureDbUser('uid-1', 'a@b.c', { displayName: 'Ada' })
    c.get = 0; c.scan = 0; c.mutate = 0; c.put = 0
    const again = await ensureDbUser('uid-1', 'a@b.c')
    expect(again.email).toBe('a@b.c')
    expect(c.get).toBe(1)
    expect(c.mutate + c.put + c.scan).toBe(0)
  })

  it('creates the profile on first sign-in, and only writes again if the email changed', async () => {
    const first = await ensureDbUser('uid-2', 'old@b.c', { displayName: 'Bo' })
    expect(first).toMatchObject({ email: 'old@b.c', displayName: 'Bo', learningLang: 'fr' })
    c.mutate = 0
    const moved = await ensureDbUser('uid-2', 'new@b.c')
    expect(moved.email).toBe('new@b.c')
    expect(c.mutate).toBe(1)
  })
})
