// Storage behind the models: Firestore in the app, an in-memory copy in tests. The model layer only
// needs these few operations, which keeps the Firestore-specific code in one small file.
import { clone, type Doc } from './query'

export interface Backend {
  get(coll: string, id: string): Promise<Doc | null>
  /** Write the whole document (replacing it). */
  put(coll: string, id: string, data: Doc): Promise<void>
  /** Write many documents fast (seeding). */
  putMany(coll: string, items: { id: string; data: Doc }[]): Promise<void>
  /**
   * Bulk upsert for seeding: create `insert` when the document is new, otherwise merge only the `set`
   * fields into it (so cached AI fields and user data on existing documents survive a re-seed).
   * Returns how many documents were created.
   */
  upsertMany(coll: string, items: { id: string; insert: Doc; set: Doc }[]): Promise<number>
  del(coll: string, id: string): Promise<void>
  delMany(coll: string, ids: string[]): Promise<void>
  /** Documents whose top-level fields equal every value in `eq` (no `eq` = the whole collection). */
  scan(coll: string, eq?: Record<string, unknown>): Promise<{ id: string; data: Doc }[]>
  /**
   * Atomic read-modify-write of one document. `fn` gets the current data (or null) and returns the new
   * data, null to delete, or undefined to leave it alone. Returns what `fn` returned.
   */
  mutate(coll: string, id: string, fn: (cur: Doc | null) => Doc | null | undefined): Promise<Doc | null | undefined>
}

/** Thrown when a unique key already exists. `code` matches MongoDB's duplicate-key code, which callers check. */
export class DuplicateKeyError extends Error {
  code = 11000
  constructor(coll: string, id: string) {
    super(`Duplicate key in ${coll}: ${id}`)
  }
}

export class MemoryBackend implements Backend {
  private data = new Map<string, Map<string, Doc>>()

  private table(coll: string) {
    let t = this.data.get(coll)
    if (!t) this.data.set(coll, (t = new Map()))
    return t
  }

  async get(coll: string, id: string) {
    const d = this.table(coll).get(id)
    return d ? clone(d) : null
  }
  async put(coll: string, id: string, data: Doc) {
    this.table(coll).set(id, clone(data))
  }
  async putMany(coll: string, items: { id: string; data: Doc }[]) {
    for (const i of items) this.table(coll).set(i.id, clone(i.data))
  }
  async upsertMany(coll: string, items: { id: string; insert: Doc; set: Doc }[]) {
    let created = 0
    for (const i of items) {
      const cur = this.table(coll).get(i.id)
      if (cur) Object.assign(cur, clone(i.set))
      else { this.table(coll).set(i.id, clone(i.insert)); created++ }
    }
    return created
  }
  async del(coll: string, id: string) {
    this.table(coll).delete(id)
  }
  async delMany(coll: string, ids: string[]) {
    for (const id of ids) this.table(coll).delete(id)
  }
  async scan(coll: string, eq: Record<string, unknown> = {}) {
    const out: { id: string; data: Doc }[] = []
    for (const [id, d] of this.table(coll)) {
      if (Object.entries(eq).every(([k, v]) => d[k] === v)) out.push({ id, data: clone(d) })
    }
    return out
  }
  async mutate(coll: string, id: string, fn: (cur: Doc | null) => Doc | null | undefined) {
    const t = this.table(coll)
    const cur = t.get(id)
    const next = fn(cur ? clone(cur) : null)
    if (next === undefined) return cur ? clone(cur) : null
    if (next === null) t.delete(id)
    else t.set(id, clone(next))
    return next
  }
  /** Test helper. */
  size(coll: string) {
    return this.table(coll).size
  }
}

let backend: Backend | null = null

/** Tests install a MemoryBackend here. */
export function setBackend(b: Backend | null) {
  backend = b
}

/** The app uses Firestore. Loaded lazily so tests (and the browser bundle) never pull in the Admin SDK. */
export async function getBackend(): Promise<Backend> {
  if (backend) return backend
  const { FirestoreBackend } = await import('./firestoreBackend')
  return (backend = new FirestoreBackend())
}
