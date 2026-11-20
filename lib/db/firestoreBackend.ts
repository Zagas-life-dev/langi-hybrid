import 'server-only'
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

const CHUNK = 400

export class FirestoreBackend implements Backend {
  private col(coll: string) {
    return adminDb().collection(coll)
  }

  async get(coll: string, id: string) {
    const snap = await this.col(coll).doc(id).get()
    return snap.exists ? read(snap.data()) : null
  }

  async put(coll: string, id: string, data: Doc) {
    await this.col(coll).doc(id).set(data)
  }

  async putMany(coll: string, items: { id: string; data: Doc }[]) {
    const writer = adminDb().bulkWriter()
    for (const i of items) writer.set(this.col(coll).doc(i.id), i.data)
    await writer.close()
  }

  async del(coll: string, id: string) {
    await this.col(coll).doc(id).delete()
  }

  async delMany(coll: string, ids: string[]) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = adminDb().batch()
      for (const id of ids.slice(i, i + CHUNK)) batch.delete(this.col(coll).doc(id))
      await batch.commit()
    }
  }

  async scan(coll: string, eq: Record<string, unknown> = {}) {
    let q: Query = this.col(coll)
    for (const [k, v] of Object.entries(eq)) if (pushable(v)) q = q.where(k, '==', v)
    const snap = await q.get()
    return snap.docs.map((d) => ({ id: d.id, data: read(d.data()) }))
  }

  async mutate(coll: string, id: string, fn: (cur: Doc | null) => Doc | null | undefined) {
    const ref = this.col(coll).doc(id)
    return adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const cur = snap.exists ? read(snap.data()) : null
      const next = fn(cur)
      if (next === undefined) return cur
      if (next === null) tx.delete(ref)
      else tx.set(ref, next)
      return next
    })
  }
}
