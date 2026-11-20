import { Timestamp, type Query } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type { Backend } from './backend'
import type { Doc } from './query'

// The Firestore implementation of Backend. Server-only.

/** Firestore stores dates as Timestamps; the app works with Dates. Converts recursively. */
function fromStore(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate()
  if (Array.isArray(v)) return v.map(fromStore)
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fromStore(x)]))
  }
  return v
}

const read = (d: FirebaseFirestore.DocumentData | undefined): Doc => fromStore(d ?? {}) as Doc

/** Only strings, numbers, booleans can be pushed down as `==` filters safely. */
const pushable = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

// A running tally of documents read and written. Firestore's free plan allows 50,000 reads and 20,000
// writes a day, so in development this prints a line every 200 operations: a runaway query shows up at once.
const usage = ((globalThis as unknown as { __langiFsUsage?: { reads: number; writes: number; loggedAt: number } }).__langiFsUsage ??=
  { reads: 0, writes: 0, loggedAt: 0 })
function tally(reads: number, writes = 0) {
  usage.reads += reads
  usage.writes += writes
  const total = usage.reads + usage.writes
  if (process.env.NODE_ENV !== 'production' && total - usage.loggedAt >= 200) {
    usage.loggedAt = total
    console.info(`[firestore] since the server started: ${usage.reads} reads, ${usage.writes} writes (free plan per day: 50,000 / 20,000)`)
  }
}

const CHUNK = 400
/** Firestore allows at most 30 values in one `in` filter. */
const IN_LIMIT = 30

export class FirestoreBackend implements Backend {
  private col(coll: string) {
    return adminDb().collection(coll)
  }

  async get(coll: string, id: string) {
    const snap = await this.col(coll).doc(id).get()
    tally(1)
    return snap.exists ? read(snap.data()) : null
  }

  async put(coll: string, id: string, data: Doc) {
    await this.col(coll).doc(id).set(data)
    tally(0, 1)
  }

  async putMany(coll: string, items: { id: string; data: Doc }[]) {
    const writer = adminDb().bulkWriter()
    for (const i of items) writer.set(this.col(coll).doc(i.id), i.data)
    await writer.close()
    tally(0, items.length)
  }

  async upsertMany(coll: string, items: { id: string; insert: Doc; set: Doc }[]) {
    // Pass 1: create every document. The ones that already exist fail with ALREADY_EXISTS.
    const creator = adminDb().bulkWriter()
    const results = items.map((i) => creator.create(this.col(coll).doc(i.id), i.insert).then(() => null, () => i))
    await creator.close()
    const existing = (await Promise.all(results)).filter((i): i is (typeof items)[number] => i !== null)
    // Pass 2: merge just the `set` fields into those, leaving everything else on them alone.
    if (existing.length) {
      const merger = adminDb().bulkWriter()
      for (const i of existing) merger.set(this.col(coll).doc(i.id), i.set, { merge: true })
      await merger.close()
    }
    tally(0, items.length + existing.length)
    return items.length - existing.length
  }

  async del(coll: string, id: string) {
    await this.col(coll).doc(id).delete()
    tally(0, 1)
  }

  async delMany(coll: string, ids: string[]) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = adminDb().batch()
      for (const id of ids.slice(i, i + CHUNK)) batch.delete(this.col(coll).doc(id))
      await batch.commit()
    }
    tally(0, ids.length)
  }

  async scan(coll: string, eq: Record<string, unknown> = {}): Promise<{ id: string; data: Doc }[]> {
    // An array value means "any of these": Firestore's `in` takes at most 30 values, so split into parallel queries.
    const listKey = Object.keys(eq).find((k) => Array.isArray(eq[k]))
    if (listKey) {
      const values = eq[listKey] as unknown[]
      const rest = { ...eq }
      delete rest[listKey]
      const parts = await Promise.all(
        Array.from({ length: Math.ceil(values.length / IN_LIMIT) }, (_, i) =>
          this.run(coll, rest, [listKey, values.slice(i * IN_LIMIT, (i + 1) * IN_LIMIT)])),
      )
      const seen = new Map<string, { id: string; data: Doc }>()
      for (const rows of parts) for (const r of rows) seen.set(r.id, r)
      return [...seen.values()]
    }
    return this.run(coll, eq)
  }

  private query(coll: string, eq: Record<string, unknown>, list?: [string, unknown[]]): Query {
    let q: Query = this.col(coll)
    for (const [k, v] of Object.entries(eq)) if (pushable(v)) q = q.where(k, '==', v)
    if (list) q = q.where(list[0], 'in', list[1])
    return q
  }

  async count(coll: string, eq: Record<string, unknown>) {
    const listKey = Object.keys(eq).find((k) => Array.isArray(eq[k]))
    if (listKey) return (await this.scan(coll, eq)).length // rare: count the documents the simple way
    const snap = await this.query(coll, eq).count().get()
    tally(1)
    return snap.data().count
  }

  private async run(coll: string, eq: Record<string, unknown>, list?: [string, unknown[]]) {
    const snap = await this.query(coll, eq, list).get()
    tally(Math.max(1, snap.size))
    return snap.docs.map((d) => ({ id: d.id, data: read(d.data()) }))
  }

  async mutate(coll: string, id: string, fn: (cur: Doc | null) => Doc | null | undefined) {
    const ref = this.col(coll).doc(id)
    return adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const cur = snap.exists ? read(snap.data()) : null
      const next = fn(cur)
      tally(1, next === undefined ? 0 : 1)
      if (next === undefined) return cur
      if (next === null) tx.delete(ref)
      else tx.set(ref, next)
      return next
    })
  }
}
