import { describe, it, expect } from 'vitest'
import { loadsJsonish } from '@/lib/jsonish'

describe('loadsJsonish', () => {
  it('parses plain JSON', () => {
    expect(loadsJsonish('{"a":1}')).toEqual({ a: 1 })
  })

  it('takes the first balanced object when the model repeats a tail after it', () => {
    const raw = '{"lines": ["do you want coffee", "coffee, coffee"]}\ncoffee, coffee"]}\ncoffee, coffee"]}'
    expect(loadsJsonish(raw)).toEqual({ lines: ['do you want coffee', 'coffee, coffee'] })
  })

  it('ignores braces inside strings and surrounding prose', () => {
    expect(loadsJsonish('Sure! ```json\n{"t": "a } b", "n": [1]}\n``` done')).toEqual({ t: 'a } b', n: [1] })
  })

  it('falls back to a bare array, and null for garbage', () => {
    expect(loadsJsonish('here: ["x", "y"]')).toEqual(['x', 'y'])
    expect(loadsJsonish('no json here')).toBeNull()
  })
})
