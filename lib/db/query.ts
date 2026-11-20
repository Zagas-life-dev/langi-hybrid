// The query and update engine behind Langi's Firestore models. Pure functions over plain objects
// (no Firebase imports), so the exact Mongo-style semantics the app relies on are unit-tested.
// Supported filters: equality (arrays match by containment), $in $nin $ne $gt $gte $lt $lte $exists
// $regex $size $elemMatch $not, and top-level $or $and $nor. Updates: $set $setOnInsert $inc $push
// (with $each) $addToSet $pull $unset, or a plain object (treated as $set).

export type Doc = Record<string, unknown>
export type Filter = Record<string, unknown>

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp)

const isOpObject = (v: unknown): v is Record<string, unknown> =>
  isPlainObject(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => k.startsWith('$'))

/** Dates compare by time; everything else as itself. */
function comparable(v: unknown): unknown {
  return v instanceof Date ? v.getTime() : v
}

/** Read a dotted path. Through an array of objects it collects every value (Mongo semantics). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  const parts = path.split('.')
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur) && !/^\d+$/.test(parts[i])) {
      const rest = parts.slice(i).join('.')
      return cur.map((x) => getPath(x, rest)).flat().filter((x) => x !== undefined)
    }
    cur = (cur as Record<string, unknown>)[parts[i]]
  }
  return cur
}

export function setPath(obj: Doc, path: string, value: unknown) {
  const parts = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {}
    cur = cur[parts[i]] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
}

function unsetPath(obj: Doc, path: string) {
  const parts = path.split('.')
  let cur: unknown = obj
  for (let i = 0; i < parts.length - 1; i++) {
    cur = (cur as Record<string, unknown> | undefined)?.[parts[i]]
    if (!isPlainObject(cur)) return
  }
  delete (cur as Record<string, unknown>)[parts[parts.length - 1]]
}

function deepEqual(a: unknown, b: unknown): boolean {
  const x = comparable(a)
  const y = comparable(b)
  if (x === y) return true
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => deepEqual(v, y[i]))
  if (isPlainObject(x) && isPlainObject(y)) {
    const kx = Object.keys(x)
    return kx.length === Object.keys(y).length && kx.every((k) => deepEqual(x[k], y[k]))
  }
  return false
}

/** Equality the Mongo way: null matches missing, and a scalar matches an array that contains it. */
function eq(docValue: unknown, want: unknown): boolean {
  if (want === null || want === undefined) return docValue === null || docValue === undefined
  if (Array.isArray(docValue) && !Array.isArray(want)) return docValue.some((v) => deepEqual(v, want))
  return deepEqual(docValue, want)
}

function cmp(a: unknown, b: unknown): number | null {
  const x = comparable(a)
  const y = comparable(b)
  if (typeof x === 'number' && typeof y === 'number') return x - y
  if (typeof x === 'string' && typeof y === 'string') return x < y ? -1 : x > y ? 1 : 0
  return null
}

function opCompare(docValue: unknown, want: unknown, test: (c: number) => boolean): boolean {
  const values = Array.isArray(docValue) ? docValue : [docValue]
  return values.some((v) => {
    if (v === null || v === undefined) return false
    const c = cmp(v, want)
    return c !== null && test(c)
  })
}

function matchCondition(docValue: unknown, cond: unknown, ci: boolean): boolean {
  if (cond instanceof RegExp) {
    const values = Array.isArray(docValue) ? docValue : [docValue]
    return values.some((v) => typeof v === 'string' && new RegExp(cond.source, cond.flags.replace('g', '')).test(v))
  }
  if (!isOpObject(cond)) return ci ? eqInsensitive(docValue, cond) : eq(docValue, cond)

  for (const [op, arg] of Object.entries(cond)) {
    switch (op) {
      case '$eq': if (!eq(docValue, arg)) return false; break
      case '$ne': if (eq(docValue, arg)) return false; break
      case '$in': {
        const list = arg as unknown[]
        if (!list.some((w) => (w instanceof RegExp ? matchCondition(docValue, w, ci) : ci ? eqInsensitive(docValue, w) : eq(docValue, w)))) return false
        break
      }
      case '$nin': {
        const list = arg as unknown[]
        if (list.some((w) => eq(docValue, w))) return false
        break
      }
      case '$gt': if (!opCompare(docValue, arg, (c) => c > 0)) return false; break
      case '$gte': if (!opCompare(docValue, arg, (c) => c >= 0)) return false; break
      case '$lt': if (!opCompare(docValue, arg, (c) => c < 0)) return false; break
      case '$lte': if (!opCompare(docValue, arg, (c) => c <= 0)) return false; break
      case '$exists': if ((docValue !== undefined) !== Boolean(arg)) return false; break
      case '$regex': {
        const re = arg instanceof RegExp ? arg : new RegExp(String(arg), String((cond as Record<string, unknown>).$options ?? ''))
        if (!matchCondition(docValue, re, ci)) return false
        break
      }
      case '$options': break
      case '$size': if (!Array.isArray(docValue) || docValue.length !== arg) return false; break
      case '$elemMatch':
        if (!Array.isArray(docValue) || !docValue.some((v) => (isPlainObject(v) ? matches(v, arg as Filter) : matchCondition(v, arg, ci)))) return false
        break
      case '$not': if (matchCondition(docValue, arg, ci)) return false; break
      default:
        throw new Error(`Unsupported query operator ${op}`)
    }
  }
  return true
}

/** Case-insensitive equality for strings (accent-sensitive), used when a query asks for collation strength 2. */
function eqInsensitive(docValue: unknown, want: unknown): boolean {
  if (typeof want === 'string') {
    const values = Array.isArray(docValue) ? docValue : [docValue]
    return values.some((v) => typeof v === 'string' && v.toLowerCase() === want.toLowerCase())
  }
  return eq(docValue, want)
}

/** Does `doc` satisfy `filter`? `ci` makes plain string equality case-insensitive (collation). */
export function matches(doc: Doc, filter: Filter, ci = false): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or') { if (!(cond as Filter[]).some((f) => matches(doc, f, ci))) return false; continue }
    if (key === '$and') { if (!(cond as Filter[]).every((f) => matches(doc, f, ci))) return false; continue }
    if (key === '$nor') { if ((cond as Filter[]).some((f) => matches(doc, f, ci))) return false; continue }
    if (key.startsWith('$')) throw new Error(`Unsupported query operator ${key}`)
    if (!matchCondition(getPath(doc, key), cond, ci)) return false
  }
  return true
}

/** Top-level plain-equality fields of a filter: the values an upsert inserts, and what we can push down. */
export function equalityFields(filter: Filter): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$') || k.includes('.')) continue
    if (v instanceof RegExp || v === undefined) continue
    if (isOpObject(v)) { if ('$eq' in v) out[k] = v.$eq; continue }
    out[k] = v
  }
  return out
}

// --- Updates ------------------------------------------------------------------

export function clone<T>(v: T): T {
  if (v instanceof Date) return new Date(v.getTime()) as T
  if (Array.isArray(v)) return v.map(clone) as T
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as T
  return v
}

/** Should `$pull: { field: want }` remove this array element? */
function pullMatches(item: unknown, want: unknown): boolean {
  if (isOpObject(want)) return matchCondition(item, want, false) // e.g. { $in: [...] }
  if (isPlainObject(want) && isPlainObject(item)) return matches(item, want) // sub-document condition
  return deepEqual(item, want)
}

/** Apply a Mongo-style update to `doc` in place. `isInsert` enables $setOnInsert. */
export function applyUpdate(doc: Doc, update: Record<string, unknown>, isInsert = false): Doc {
  const keys = Object.keys(update)
  const hasOps = keys.some((k) => k.startsWith('$'))
  if (!hasOps) {
    for (const [k, v] of Object.entries(update)) setPath(doc, k, clone(v))
    return doc
  }
  for (const [op, spec] of Object.entries(update)) {
    const fields = spec as Record<string, unknown>
    switch (op) {
      case '$set': for (const [k, v] of Object.entries(fields)) setPath(doc, k, clone(v)); break
      case '$setOnInsert': if (isInsert) for (const [k, v] of Object.entries(fields)) setPath(doc, k, clone(v)); break
      case '$unset': for (const k of Object.keys(fields)) unsetPath(doc, k); break
      case '$inc':
        for (const [k, v] of Object.entries(fields)) {
          const cur = getPath(doc, k)
          setPath(doc, k, (typeof cur === 'number' ? cur : 0) + Number(v))
        }
        break
      case '$min': case '$max':
        for (const [k, v] of Object.entries(fields)) {
          const cur = getPath(doc, k)
          const c = cur === undefined ? null : cmp(v, cur)
          if (c === null || (op === '$min' ? c < 0 : c > 0)) setPath(doc, k, clone(v))
        }
        break
      case '$push':
        for (const [k, v] of Object.entries(fields)) {
          const cur = getPath(doc, k)
          const arr = Array.isArray(cur) ? cur : []
          const add = isPlainObject(v) && '$each' in v ? (v.$each as unknown[]) : [v]
          setPath(doc, k, [...arr, ...clone(add)])
        }
        break
      case '$addToSet':
        for (const [k, v] of Object.entries(fields)) {
          const cur = getPath(doc, k)
          const arr = Array.isArray(cur) ? [...cur] : []
          const add = isPlainObject(v) && '$each' in v ? (v.$each as unknown[]) : [v]
          for (const x of add) if (!arr.some((y) => deepEqual(y, x))) arr.push(clone(x))
          setPath(doc, k, arr)
        }
        break
      case '$pull':
        for (const [k, v] of Object.entries(fields)) {
          const cur = getPath(doc, k)
          if (!Array.isArray(cur)) continue
          setPath(doc, k, cur.filter((x) => !pullMatches(x, v)))
        }
        break
      default:
        throw new Error(`Unsupported update operator ${op}`)
    }
  }
  return doc
}

// --- Sorting, projection, aggregation -------------------------------------------------

export type SortSpec = Record<string, 1 | -1 | 'asc' | 'desc'> | string

function sortEntries(spec: SortSpec): [string, 1 | -1][] {
  if (typeof spec === 'string') {
    return spec.split(/\s+/).filter(Boolean).map((s) => (s.startsWith('-') ? [s.slice(1), -1] : [s.replace(/^\+/, ''), 1]) as [string, 1 | -1])
  }
  return Object.entries(spec).map(([k, v]) => [k, v === -1 || v === 'desc' ? -1 : 1] as [string, 1 | -1])
}

/** Missing values sort first ascending, like MongoDB. Stable for equal keys. */
export function sortDocs<T extends Doc>(docs: T[], spec: SortSpec): T[] {
  const entries = sortEntries(spec)
  return docs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      for (const [field, dir] of entries) {
        const x = comparable(getPath(a.d, field))
        const y = comparable(getPath(b.d, field))
        let c = 0
        if (x === undefined || x === null) c = y === undefined || y === null ? 0 : -1
        else if (y === undefined || y === null) c = 1
        else c = cmp(x, y) ?? 0
        if (c !== 0) return c * dir
      }
      return a.i - b.i
    })
    .map((x) => x.d)
}

/** Mongoose-style select: 'a b' includes, '-a -b' excludes. `_id` is kept unless excluded. */
export function project<T extends Doc>(doc: T, fields: string | Record<string, 0 | 1 | boolean>): Doc {
  const entries: [string, boolean][] = typeof fields === 'string'
    ? fields.split(/\s+/).filter(Boolean).map((f) => (f.startsWith('-') ? [f.slice(1), false] : [f.replace(/^\+/, ''), true]) as [string, boolean])
    : Object.entries(fields).map(([k, v]) => [k, Boolean(v)] as [string, boolean])
  if (!entries.length) return doc
  const includes = entries.filter(([k, on]) => on && k !== '_id')
  if (includes.length) {
    const out: Doc = {}
    if (!entries.some(([k, on]) => k === '_id' && !on) && '_id' in doc) out._id = doc._id
    for (const [k] of includes) {
      const v = getPath(doc, k)
      if (v !== undefined) setPath(out, k, clone(v))
    }
    return out
  }
  const out = clone(doc) as Doc
  for (const [k, on] of entries) if (!on) unsetPath(out, k)
  return out
}

/** A small aggregation pipeline: $match, $group ($sum, $avg, $min, $max, $first), $sort, $limit, $skip. */
export function aggregate(docs: Doc[], pipeline: Record<string, unknown>[]): Doc[] {
  let rows = docs
  for (const stage of pipeline) {
    const [name, arg] = Object.entries(stage)[0]
    if (name === '$match') rows = rows.filter((d) => matches(d, arg as Filter))
    else if (name === '$sort') rows = sortDocs(rows, arg as SortSpec)
    else if (name === '$limit') rows = rows.slice(0, Number(arg))
    else if (name === '$skip') rows = rows.slice(Number(arg))
    else if (name === '$group') {
      const spec = arg as Record<string, unknown>
      const idExpr = spec._id
      const groups = new Map<string, { id: unknown; rows: Doc[] }>()
      const keyOf = (d: Doc) => (typeof idExpr === 'string' && idExpr.startsWith('$') ? getPath(d, idExpr.slice(1)) : idExpr ?? null)
      for (const d of rows) {
        const id = keyOf(d)
        const k = JSON.stringify(comparable(id))
        if (!groups.has(k)) groups.set(k, { id, rows: [] })
        groups.get(k)!.rows.push(d)
      }
      rows = [...groups.values()].map((g) => {
        const out: Doc = { _id: g.id }
        for (const [field, acc] of Object.entries(spec)) {
          if (field === '_id') continue
          const [op, expr] = Object.entries(acc as Record<string, unknown>)[0]
          const vals = g.rows.map((r) => (typeof expr === 'string' && expr.startsWith('$') ? getPath(r, expr.slice(1)) : expr))
          const nums = vals.map(Number).filter((n) => Number.isFinite(n))
          if (op === '$sum') out[field] = nums.reduce((a, b) => a + b, 0)
          else if (op === '$avg') out[field] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
          else if (op === '$min') out[field] = nums.length ? Math.min(...nums) : null
          else if (op === '$max') out[field] = nums.length ? Math.max(...nums) : null
          else if (op === '$first') out[field] = vals[0]
          else throw new Error(`Unsupported accumulator ${op}`)
        }
        return out
      })
    } else throw new Error(`Unsupported pipeline stage ${name}`)
  }
  return rows
}
