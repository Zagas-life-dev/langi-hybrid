// Langi's data models on Firestore, with the same call shapes the app already used with Mongoose
// (find / findOne / updateOne / $inc / save ...), so routes keep working while the storage moves.
//
// How it stays correct and cheap on Firestore:
//  - Queries push plain equality on `indexed` fields down to Firestore and filter, sort and page the rest
//    in memory. That avoids composite indexes entirely and is fine at Langi's data sizes.
//  - A model with a `key` (e.g. UserCard = userId + cardId) uses a deterministic document id, so lookups
//    and upserts on that key are exact single reads and race-free.
//  - document.save() writes only the fields that changed, so it never overwrites a concurrent $inc.
import { applyUpdate, aggregate as runAggregate, clone, equalityFields, matches, project, sameValue, sortDocs, type Doc, type Filter, type SortSpec } from './query'
import { DuplicateKeyError, getBackend, type Backend } from './backend'

export type { Filter, SortSpec } from './query'
export { DuplicateKeyError } from './backend'

/** Fields every stored document has. Interfaces for each model extend this. */
export interface Document {
  _id: string
  createdAt?: Date
  updatedAt?: Date
  save(): Promise<this>
  deleteOne(): Promise<{ deletedCount: number }>
  toObject(): Record<string, unknown>
}

export interface UpdateResult {
  acknowledged: boolean
  matchedCount: number
  modifiedCount: number
  upsertedCount: number
  upsertedId?: string
}

type Projection = string | Record<string, 0 | 1 | boolean>
type UpdateOpts = { upsert?: boolean; new?: boolean; returnDocument?: 'before' | 'after'; sort?: SortSpec }

interface QState { sort?: SortSpec; limit?: number; skip?: number; select?: Projection; ci?: boolean; lean?: boolean }

/** A chainable, awaitable query: `await Model.find(f).sort({ a: -1 }).limit(5).lean()`. */
export class Query<R, D = R> implements PromiseLike<R> {
  private s: QState = {}
  constructor(private runner: (s: QState) => Promise<unknown>) {}
  sort(spec: SortSpec) { this.s.sort = spec; return this }
  limit(n: number) { this.s.limit = n; return this }
  skip(n: number) { this.s.skip = n; return this }
  select(fields: Projection) { this.s.select = fields; return this }
  /** Mongo collation (strength 2): string equality ignores case but not accents. */
  collation(_opts?: unknown) { this.s.ci = true; return this }
  /** Plain objects instead of documents (no save()). */
  lean<L = D>(): Query<L, L> { this.s.lean = true; return this as unknown as Query<L, L> }
  exec(): Promise<R> { return this.runner(this.s) as Promise<R> }
  then<A = R, B = never>(onOk?: ((v: R) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return this.exec().then(onOk, onErr)
  }
  catch<B = never>(onErr: (e: unknown) => B | PromiseLike<B>) { return this.exec().catch(onErr) }
}

export interface Model<T extends Document> {
  readonly modelName: string
  find(filter?: Filter, projection?: Projection): Query<T[], T[]>
  findOne(filter?: Filter, projection?: Projection): Query<T | null, T | null>
  findById(id: unknown, projection?: Projection): Query<T | null, T | null>
  create(data: Record<string, unknown>): Promise<T>
  create(data: Record<string, unknown>[]): Promise<T[]>
  insertMany(docs: Record<string, unknown>[]): Promise<T[]>
  updateOne(filter: Filter, update: Record<string, unknown>, opts?: UpdateOpts): Promise<UpdateResult>
  updateMany(filter: Filter, update: Record<string, unknown>, opts?: UpdateOpts): Promise<UpdateResult>
  findOneAndUpdate(filter: Filter, update: Record<string, unknown>, opts?: UpdateOpts): Query<T | null, T | null>
  findByIdAndUpdate(id: unknown, update: Record<string, unknown>, opts?: UpdateOpts): Query<T | null, T | null>
  deleteOne(filter: Filter): Promise<{ deletedCount: number }>
  deleteMany(filter?: Filter): Promise<{ deletedCount: number }>
  countDocuments(filter?: Filter): Promise<number>
  distinct<V = unknown>(field: string, filter?: Filter): Promise<V[]>
  exists(filter: Filter): Promise<{ _id: string } | null>
  aggregate<R = Doc>(pipeline: Record<string, unknown>[]): Promise<R[]>
  /** Seeding: upsert many `{ updateOne: { filter, update: { $set }, upsert: true } }` operations quickly. */
  bulkWrite(ops: BulkOp[]): Promise<{ upsertedCount: number; matchedCount: number }>
  /** No-op: Firestore needs no index creation for how Langi queries (see the model options). */
  createIndexes(): Promise<void>
}

export type BulkOp =
  | { updateOne: { filter: Filter; update: Record<string, unknown>; upsert?: boolean } }
  | { insertOne: { document: Record<string, unknown> } }

export interface ModelOptions {
  collection: string
  /** Values filled in when a document is created. A function is called each time (for dates and arrays). */
  defaults?: Doc | (() => Doc)
  /** Maintain createdAt / updatedAt like Mongoose timestamps. */
  timestamps?: boolean
  /** Unique key fields: they form the document id, so duplicates are impossible and lookups are direct. */
  key?: string[]
  /** Top-level scalar fields worth filtering on inside Firestore (everything else filters in memory). */
  indexed?: string[]
}

const isScalar = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

/** Document ids cannot contain '/', so escape it; very long keys are shortened with a hash. */
function encodeId(parts: unknown[]): string {
  const raw = 'k_' + parts.map((p) => String(p).replace(/%/g, '%25').replace(/\//g, '%2F')).join('__')
  if (raw.length <= 700) return raw
  let h = 5381
  for (let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0
  return raw.slice(0, 600) + '~' + h.toString(36)
}

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20)

function compact(d: Doc): Doc {
  const out: Doc = {}
  for (const [k, v] of Object.entries(d)) if (v !== undefined) out[k] = v
  return out
}

export function defineModel<T extends Document>(opts: ModelOptions): Model<T> {
  const coll = opts.collection
  const indexed = new Set(opts.indexed ?? [])
  const key = opts.key

  const defaults = (): Doc => {
    const d = typeof opts.defaults === 'function' ? opts.defaults() : clone(opts.defaults ?? {})
    return d
  }
  const keyOf = (values: Record<string, unknown>) => encodeId(key!.map((k) => values[k]))
  const keyComplete = (values: Record<string, unknown>) => !!key && key.every((k) => isScalar(values[k]))

  // Documents in the app are class instances so `save()` and `deleteOne()` exist; the snapshot (non-enumerable)
  // lets save() write only what changed.
  class Hydrated {
    async save(this: Doc & Hydrated) {
      const id = String(this._id)
      const snap = (this as unknown as { __snap: Doc }).__snap
      const now = new Date()
      if (opts.timestamps) this.updatedAt = now
      const current = plain(this)
      const changed: Doc = {}
      const removed: string[] = []
      for (const k of Object.keys(current)) if (!sameValue(snap[k], current[k])) changed[k] = clone(current[k])
      for (const k of Object.keys(snap)) if (!(k in current)) removed.push(k)
      const b = await getBackend()
      await b.mutate(coll, id, (cur) => {
        const base = cur ?? clone(snap)
        for (const [k, v] of Object.entries(changed)) base[k] = v
        for (const k of removed) delete base[k]
        return compact(base)
      })
      Object.defineProperty(this, '__snap', { value: clone(current), enumerable: false, writable: true, configurable: true })
      return this
    }
    async deleteOne(this: Doc & Hydrated) {
      await (await getBackend()).del(coll, String(this._id))
      return { deletedCount: 1 }
    }
    toObject(this: Doc) { return clone(plain(this)) }
    toJSON(this: Doc) { return clone(plain(this)) }
  }

  const plain = (d: Doc): Doc => {
    const out: Doc = {}
    for (const k of Object.keys(d)) if (k !== '_id' && d[k] !== undefined) out[k] = d[k]
    return out
  }
  const withId = (id: string, data: Doc): Doc => ({ ...data, _id: id })

  function hydrate(id: string, data: Doc): T {
    const doc = new Hydrated() as unknown as Doc
    Object.assign(doc, data, { _id: id })
    Object.defineProperty(doc, '__snap', { value: clone(plain(doc)), enumerable: false, writable: true, configurable: true })
    return doc as unknown as T
  }

  /** Candidate documents for a filter, as narrow as Firestore can cheaply make them. */
  async function candidates(b: Backend, filter: Filter, ci: boolean): Promise<{ id: string; data: Doc }[]> {
    const eqf = equalityFields(filter)
    if (typeof eqf._id === 'string') {
      const d = await b.get(coll, eqf._id)
      return d ? [{ id: eqf._id, data: d }] : []
    }
    const idCond = filter._id
    if (idCond && typeof idCond === 'object' && Array.isArray((idCond as { $in?: unknown }).$in)) {
      const ids = [...new Set(((idCond as { $in: unknown[] }).$in).map(String))]
      const found = await Promise.all(ids.map(async (id) => ({ id, data: await b.get(coll, id) })))
      return found.filter((f): f is { id: string; data: Doc } => f.data !== null)
    }
    if (keyComplete(eqf) && !ci) {
      const id = keyOf(eqf)
      const d = await b.get(coll, id)
      return d ? [{ id, data: d }] : []
    }
    const push: Record<string, unknown> = {}
    for (const k of indexed) {
      const v = eqf[k]
      if (isScalar(v) && !(ci && typeof v === 'string')) push[k] = v
    }
    return b.scan(coll, push)
  }

  async function matching(filter: Filter, ci = false): Promise<Doc[]> {
    const b = await getBackend()
    const rows = await candidates(b, filter, ci)
    return rows.map((r) => withId(r.id, r.data)).filter((d) => matches(d, filter, ci))
  }

  function run<R>(filter: Filter, one: boolean, projection?: Projection) {
    return new Query<R, R>(async (s) => {
      let rows = await matching(filter, !!s.ci)
      if (s.sort) rows = sortDocs(rows, s.sort)
      if (s.skip) rows = rows.slice(s.skip)
      const limit = one ? 1 : s.limit
      if (limit !== undefined && limit > 0) rows = rows.slice(0, limit)
      const sel = s.select ?? projection
      const out = rows.map((d) => (sel ? project(d, sel) : d))
      const finish = (d: Doc) => (s.lean ? clone(d) : hydrate(String(d._id), plain(d)))
      return one ? (out[0] ? finish(out[0]) : null) : out.map(finish)
    })
  }

  async function createOne(data: Doc): Promise<T> {
    const now = new Date()
    const doc: Doc = compact({ ...defaults(), ...clone(compact(data)) })
    if (opts.timestamps) { doc.createdAt ??= now; doc.updatedAt ??= now }
    let id: string
    if (key) {
      if (!keyComplete(doc)) throw new Error(`${coll}: missing key field(s) ${key.join(', ')}`)
      id = keyOf(doc)
    } else {
      id = typeof doc._id === 'string' && doc._id ? doc._id : newId()
    }
    delete doc._id
    const b = await getBackend()
    if (key) await b.mutate(coll, id, (cur) => { if (cur) throw new DuplicateKeyError(coll, id); return doc })
    else await b.put(coll, id, doc)
    return hydrate(id, doc)
  }

  const stamp = (d: Doc): Doc => { if (opts.timestamps) d.updatedAt = new Date(); return d }

  /** Shared by updateOne / updateMany / findOneAndUpdate. */
  async function updateCore(filter: Filter, update: Record<string, unknown>, o: UpdateOpts & { many?: boolean; ci?: boolean }) {
    const b = await getBackend()
    let rows = await matching(filter, !!o.ci)
    if (o.sort) rows = sortDocs(rows, o.sort)
    if (!o.many) rows = rows.slice(0, 1)

    const result: UpdateResult & { before: Doc | null; after: Doc | null; id?: string } = {
      acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, before: null, after: null,
    }
    for (const row of rows) {
      const id = String(row._id)
      let before: Doc | null = null
      const next = await b.mutate(coll, id, (cur) => {
        if (!cur || !matches(withId(id, cur), filter, !!o.ci)) return undefined
        before = clone(cur)
        return compact(stamp(applyUpdate(clone(cur), update)))
      })
      if (before) {
        result.matchedCount++
        result.modifiedCount++
        if (!result.before) { result.before = before; result.after = next ? withId(id, next) : null; result.id = id }
      }
    }
    if (result.matchedCount > 0 || !o.upsert) return result

    // Upsert: start from the filter's equality fields, then apply the update as an insert.
    const eqf = equalityFields(filter)
    const doc: Doc = compact(applyUpdate({ ...defaults(), ...clone(eqf) }, update, true))
    const now = new Date()
    if (opts.timestamps) { doc.createdAt ??= now; doc.updatedAt ??= now }
    let id: string
    if (key) {
      if (!keyComplete(doc)) throw new Error(`${coll}: upsert is missing key field(s) ${key.join(', ')}`)
      id = keyOf(doc)
    } else {
      id = typeof doc._id === 'string' && doc._id ? doc._id : newId()
    }
    delete doc._id
    let inserted = false
    const created = await b.mutate(coll, id, (cur) => {
      // Someone else inserted it a moment ago: apply the update to theirs instead of overwriting.
      if (cur) { inserted = false; return compact(stamp(applyUpdate(clone(cur), update))) }
      inserted = true
      return doc
    })
    if (inserted) { result.upsertedCount = 1; result.upsertedId = id } else { result.matchedCount = 1; result.modifiedCount = 1 }
    result.after = created ? withId(id, created) : null
    result.id = id
    return result
  }

  const publicResult = (r: UpdateResult): UpdateResult => ({
    acknowledged: r.acknowledged, matchedCount: r.matchedCount, modifiedCount: r.modifiedCount,
    upsertedCount: r.upsertedCount, upsertedId: r.upsertedId,
  })

  function findAndUpdate(filter: Filter, update: Record<string, unknown>, o: UpdateOpts = {}) {
    return new Query<T | null, T | null>(async (s) => {
      const r = await updateCore(filter, update, { ...o, ci: s.ci })
      const wantAfter = o.new === true || o.returnDocument === 'after'
      const doc = wantAfter ? r.after : r.before
      if (!doc) return null
      return s.lean ? clone(doc) : hydrate(String(doc._id), plain(doc))
    })
  }

  const model: Model<T> = {
    modelName: coll,
    find: (filter = {}, projection) => run<T[]>(filter, false, projection),
    findOne: (filter = {}, projection) => run<T | null>(filter, true, projection),
    findById: (id, projection) => (typeof id === 'string' && id ? run<T | null>({ _id: id }, true, projection) : run<T | null>({ _id: '__none__' }, true)),
    create: ((data: Doc | Doc[]) => (Array.isArray(data) ? Promise.all(data.map(createOne)) : createOne(data))) as Model<T>['create'],
    insertMany: (docs) => Promise.all(docs.map(createOne)),
    updateOne: async (filter, update, o = {}) => publicResult(await updateCore(filter, update, o)),
    updateMany: async (filter, update, o = {}) => publicResult(await updateCore(filter, update, { ...o, many: true })),
    findOneAndUpdate: (filter, update, o) => findAndUpdate(filter, update, o),
    findByIdAndUpdate: (id, update, o) => findAndUpdate({ _id: String(id) }, update, o),
    deleteOne: async (filter) => {
      const rows = await matching(filter)
      if (!rows[0]) return { deletedCount: 0 }
      await (await getBackend()).del(coll, String(rows[0]._id))
      return { deletedCount: 1 }
    },
    deleteMany: async (filter = {}) => {
      const rows = await matching(filter)
      await (await getBackend()).delMany(coll, rows.map((r) => String(r._id)))
      return { deletedCount: rows.length }
    },
    countDocuments: async (filter = {}) => (await matching(filter)).length,
    distinct: async <V>(field: string, filter: Filter = {}) => {
      const seen = new Map<string, V>()
      for (const d of await matching(filter)) {
        const v = d[field.split('.')[0]] as unknown
        for (const x of (Array.isArray(v) ? v : [v]) as V[]) if (x !== undefined && x !== null) seen.set(JSON.stringify(x), x)
      }
      return [...seen.values()]
    },
    exists: async (filter) => {
      const rows = await matching(filter)
      return rows[0] ? { _id: String(rows[0]._id) } : null
    },
    createIndexes: async () => {},
    bulkWrite: async (ops) => {
      const items: { id: string; insert: Doc; set: Doc }[] = []
      let upsertedCount = 0
      let matchedCount = 0
      for (const op of ops) {
        if ('insertOne' in op) { await createOne(op.insertOne.document); upsertedCount++; continue }
        const { filter, update, upsert } = op.updateOne
        const onlySet = Object.keys(update).every((k) => k === '$set' || k === '$setOnInsert')
        const eqf = equalityFields(filter)
        if (upsert && key && onlySet && keyComplete(eqf)) {
          // The fast path: a keyed upsert becomes one create-or-merge in a bulk write.
          const now = new Date()
          const insert = compact(applyUpdate({ ...defaults(), ...clone(eqf) }, update, true))
          if (opts.timestamps) { insert.createdAt ??= now; insert.updatedAt ??= now }
          const set = compact(applyUpdate({}, { $set: (update.$set as Doc) ?? {} }))
          if (opts.timestamps) set.updatedAt = now
          items.push({ id: keyOf(insert), insert, set })
        } else {
          const r = await updateCore(filter, update, { upsert })
          upsertedCount += r.upsertedCount
          matchedCount += r.matchedCount
        }
      }
      if (items.length) {
        const b = await getBackend()
        for (let i = 0; i < items.length; i += 1000) {
          const chunk = items.slice(i, i + 1000)
          const created = await b.upsertMany(coll, chunk)
          upsertedCount += created
          matchedCount += chunk.length - created
        }
      }
      return { upsertedCount, matchedCount }
    },
    aggregate: async <R>(pipeline: Record<string, unknown>[]) => {
      const first = pipeline[0] && '$match' in pipeline[0] ? (pipeline[0].$match as Filter) : {}
      const rows = await matching(first)
      return runAggregate(rows, pipeline) as R[]
    },
  }
  return model
}
