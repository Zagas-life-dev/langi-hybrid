import { describe, expect, it } from 'vitest'
import { parseDictationLines } from '@/lib/hybrid/linesCore'
import { cleanStory } from '@/lib/hybrid/storyCore'

describe('parseDictationLines', () => {
  it('reads "sentence | translation" lines and ignores numbering and quotes', () => {
    const raw = '1. "Je bois du café le matin." | I drink coffee in the morning.\n- Il fait beau aujourd’hui | The weather is nice today\n\nOk | x'
    expect(parseDictationLines(raw)).toEqual([
      { text: 'Je bois du café le matin.', translation: 'I drink coffee in the morning.' },
      { text: 'Il fait beau aujourd’hui', translation: 'The weather is nice today' },
    ])
  })

  it('keeps a sentence with no translation, drops junk, and caps the count', () => {
    expect(parseDictationLines('Bonjour tout le monde')).toEqual([{ text: 'Bonjour tout le monde', translation: '' }])
    const many = Array.from({ length: 10 }, (_, i) => `Phrase numéro ${i} ici | s${i}`).join('\n')
    expect(parseDictationLines(many, 4)).toHaveLength(4)
    expect(parseDictationLines('')).toEqual([])
  })
})

describe('cleanStory', () => {
  const sentence = (n: number) => ({ text: `Phrase ${n}.`, translation: `Sentence ${n}.` })
  it('rejects a story that is too short', () => {
    expect(cleanStory({ title: 'x', sentences: [sentence(1), sentence(2)] })).toBeNull()
    expect(cleanStory({})).toBeNull()
  })

  it('bounds lengths and fixes out-of-range answers', () => {
    const out = cleanStory({
      title: '  Le chat  ',
      sentences: Array.from({ length: 30 }, (_, i) => sentence(i)),
      glossary: [{ term: 'chat', translation: 'cat' }, { term: 'vide', translation: '' }],
      questions: [{ question: 'Q?', options: ['a', 'b'], answer: 9 }, { question: '', options: ['a', 'b'], answer: 0 }],
    })!
    expect(out.title).toBe('Le chat')
    expect(out.sentences).toHaveLength(20)
    expect(out.glossary).toEqual([{ term: 'chat', translation: 'cat' }])
    expect(out.questions).toEqual([{ question: 'Q?', options: ['a', 'b'], answer: 1 }])
  })

  it('falls back to a default title', () => {
    expect(cleanStory({ sentences: [sentence(1), sentence(2), sentence(3)] })!.title).toBe('Story')
  })
})
