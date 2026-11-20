import { describe, expect, it } from 'vitest'
import { aggregate, applyUpdate, equalityFields, matches, project, sortDocs } from '@/lib/db/query'

const d = (s: string) => new Date(s)

describe('matches', () => {
  const doc = { _id: 'a', userId: 'u1', box: 3, tags: ['sentence', 'A2'], dueAt: d('2026-11-20'), source: { kind: 'video', ref: 'v1' }, term: 'Pain' }

  it('plain equality, including a scalar inside an array', () => {
    expect(matches(doc, { userId: 'u1', box: 3 })).toBe(true)
    expect(matches(doc, { tags: 'A2' })).toBe(true)
    expect(matches(doc, { tags: 'B1' })).toBe(false)
    expect(matches(doc, { userId: 'u2' })).toBe(false)
  })

  it('null matches a missing field, and dotted paths reach into sub-documents', () => {
    expect(matches(doc, { lastReviewedAt: null })).toBe(true)
    expect(matches(doc, { 'source.kind': 'video' })).toBe(true)
    expect(matches(doc, { 'source.kind': 'story' })).toBe(false)
  })

  it('comparison operators work on dates and numbers', () => {
    expect(matches(doc, { dueAt: { $lte: d('2026-11-21') } })).toBe(true)
    expect(matches(doc, { dueAt: { $gt: d('2026-11-21') } })).toBe(false)
    expect(matches(doc, { box: { $gte: 2, $lt: 4 } })).toBe(true)
    expect(matches(doc, { box: { $gt: 5 } })).toBe(false)
    expect(matches(doc, { missing: { $lt: 5 } })).toBe(false)
  })

  it('$in, $nin, $ne, $exists', () => {
    expect(matches(doc, { box: { $in: [1, 3] } })).toBe(true)
    expect(matches(doc, { box: { $nin: [3] } })).toBe(false)
    expect(matches(doc, { userId: { $ne: 'u2' } })).toBe(true)
    expect(matches(doc, { tags: { $ne: 'A2' } })).toBe(false)
    expect(matches(doc, { lastReviewedAt: { $exists: false } })).toBe(true)
    expect(matches(doc, { box: { $exists: true } })).toBe(true)
  })

  it('$or, $and, regex', () => {
    expect(matches(doc, { $or: [{ box: 9 }, { userId: 'u1' }] })).toBe(true)
    expect(matches(doc, { $or: [{ box: 9 }, { userId: 'zz' }] })).toBe(false)
    expect(matches(doc, { $and: [{ box: 3 }, { userId: 'u1' }] })).toBe(true)
    expect(matches(doc, { term: /^pa/i })).toBe(true)
    expect(matches(doc, { term: { $regex: 'ain$' } })).toBe(true)
  })

  it('collation makes string equality case-insensitive but keeps accents', () => {
    expect(matches(doc, { term: 'pain' })).toBe(false)
    expect(matches(doc, { term: 'pain' }, true)).toBe(true)
    expect(matches({ term: 'à' }, { term: 'a' }, true)).toBe(false)
    expect(matches(doc, { term: { $in: ['pain', 'vin'] } }, true)).toBe(true)
  })

  it('$elemMatch and $size on arrays', () => {
    const msg = { messages: [{ role: 'user', n: 1 }, { role: 'assistant', n: 2 }] }
    expect(matches(msg, { messages: { $elemMatch: { role: 'assistant' } } })).toBe(true)
    expect(matches(msg, { messages: { $size: 2 } })).toBe(true)
    expect(matches(msg, { 'messages.role': 'user' })).toBe(true)
  })

  it('rejects operators it does not know instead of silently matching', () => {
    expect(() => matches(doc, { box: { $weird: 1 } })).toThrow(/Unsupported/)
  })
})

describe('equalityFields', () => {
  it('keeps plain equality values only', () => {
    expect(equalityFields({ userId: 'u1', box: { $gte: 2 }, $or: [{ a: 1 }], term: /x/, kind: { $eq: 'v' } })).toEqual({ userId: 'u1', kind: 'v' })
  })
})

describe('applyUpdate', () => {
  it('$set, $inc and a plain object', () => {
    expect(applyUpdate({ xp: 5 }, { $set: { streak: 2 }, $inc: { xp: 10, hits: 1 } })).toEqual({ xp: 15, streak: 2, hits: 1 })
    expect(applyUpdate({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
  })

  it('$setOnInsert only applies on insert', () => {
    expect(applyUpdate({ a: 1 }, { $setOnInsert: { b: 2 } }, false)).toEqual({ a: 1 })
    expect(applyUpdate({ a: 1 }, { $setOnInsert: { b: 2 } }, true)).toEqual({ a: 1, b: 2 })
  })

  it('$push (with $each), $addToSet and $pull', () => {
    expect(applyUpdate({}, { $push: { list: 'a' } })).toEqual({ list: ['a'] })
    expect(applyUpdate({ list: ['a'] }, { $push: { list: { $each: ['b', 'c'] } } })).toEqual({ list: ['a', 'b', 'c'] })
    expect(applyUpdate({ tags: ['x'] }, { $addToSet: { tags: 'x' } })).toEqual({ tags: ['x'] })
    expect(applyUpdate({ tags: ['x'] }, { $addToSet: { tags: 'y' } })).toEqual({ tags: ['x', 'y'] })
    expect(applyUpdate({ friends: ['a', 'b'] }, { $pull: { friends: 'a' } })).toEqual({ friends: ['b'] })
    expect(applyUpdate({ items: [{ id: 1 }, { id: 2 }] }, { $pull: { items: { id: 1 } } })).toEqual({ items: [{ id: 2 }] })
  })

  it('supports dotted paths and $unset', () => {
    expect(applyUpdate({}, { $set: { 'a.b': 1 } })).toEqual({ a: { b: 1 } })
    expect(applyUpdate({ a: 1, b: 2 }, { $unset: { a: '' } })).toEqual({ b: 2 })
  })

  it('does not share references with the update', () => {
    const arr = [1]
    const out = applyUpdate({}, { $set: { arr } })
    arr.push(2)
    expect(out.arr).toEqual([1])
  })
})

describe('sortDocs and project', () => {
  const rows = [{ n: 2, s: 'b' }, { n: 1, s: 'a' }, { n: 3 }, { n: 1, s: 'c' }]

  it('sorts by one or more keys, missing first ascending, stable', () => {
    expect(sortDocs(rows, { n: 1 }).map((r) => r.n)).toEqual([1, 1, 2, 3])
    expect(sortDocs(rows, { n: -1, s: 1 }).map((r) => r.s)).toEqual([undefined, 'b', 'a', 'c'])
    expect(sortDocs(rows, '-n s').map((r) => r.s)).toEqual([undefined, 'b', 'a', 'c'])
    expect(sortDocs(rows, { s: 1 })[0]).toEqual({ n: 3 })
  })

  it('select includes or excludes fields and keeps _id', () => {
    const doc = { _id: 'x', a: 1, b: 2, c: 3 }
    expect(project(doc, 'a b')).toEqual({ _id: 'x', a: 1, b: 2 })
    expect(project(doc, '-b')).toEqual({ _id: 'x', a: 1, c: 3 })
    expect(project(doc, { a: 1, _id: 0 })).toEqual({ a: 1 })
  })
})

describe('aggregate', () => {
  const rows = [
    { userId: 'u1', xp: 10, score: 80 }, { userId: 'u2', xp: 5, score: 60 }, { userId: 'u1', xp: 7, score: 100 },
  ]
  it('groups with $sum and $avg', () => {
    const out = aggregate(rows, [{ $group: { _id: '$userId', xp: { $sum: '$xp' } } }, { $sort: { xp: -1 } }])
    expect(out).toEqual([{ _id: 'u1', xp: 17 }, { _id: 'u2', xp: 5 }])
    expect(aggregate(rows, [{ $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$score' } } }])).toEqual([{ _id: null, count: 3, avg: 80 }])
  })
  it('matches, sorts and limits', () => {
    expect(aggregate(rows, [{ $match: { userId: 'u1' } }, { $sort: { xp: 1 } }, { $limit: 1 }])).toEqual([rows[2]])
  })
})
