import { describe, it, expect } from 'vitest'
import {
  normalizeAnswer,
  checkAnswer,
  clozePrompt,
  grade,
  intervalFor,
  RELEARN_STEP_MS,
  DUE_AFTER_MS,
  MAX_INTERVAL_MS,
  type AnswerCard,
} from '@/lib/srs-core'

const DAY = 86_400_000
const T0 = 1_700_000_000_000

describe('normalizeAnswer', () => {
  it('lenient strips article, case and punctuation', () => expect(normalizeAnswer('Le Chat!', 'lenient')).toBe('chat'))
  it('lenient strips an elided article', () => expect(normalizeAnswer("l'eau", 'lenient')).toBe('eau'))
  it('lenient strips accents', () => expect(normalizeAnswer('été', 'lenient')).toBe('ete'))
  it('strict keeps accents', () => expect(normalizeAnswer('été', 'strict')).toBe('été'))
  it('strict keeps the article', () => expect(normalizeAnswer('le chat', 'strict')).toBe('le chat'))
})

describe('checkAnswer', () => {
  const hi: AnswerCard = { term: 'salut', translation: 'hi/hello', acceptedAnswers: ['hey'] }
  const chat: AnswerCard = { term: 'le chat', translation: 'the cat' }

  it('matches a slash alternate', () => expect(checkAnswer(hi, 'hello', 'recognition', 'lenient')).toBe(true))
  it('matches an acceptedAnswer', () => expect(checkAnswer(hi, 'hey', 'recognition', 'lenient')).toBe(true))
  it('rejects a wrong answer', () => expect(checkAnswer(hi, 'goodbye', 'recognition', 'lenient')).toBe(false))
  it('rejects an empty answer', () => expect(checkAnswer(hi, '', 'recognition', 'lenient')).toBe(false))
  it('strict: wrong gender is wrong', () => expect(checkAnswer(chat, 'la chat', 'production', 'strict')).toBe(false))
  it('strict: right gender is right', () => expect(checkAnswer(chat, 'le chat', 'production', 'strict')).toBe(true))
  it('lenient: bare noun accepted', () => expect(checkAnswer(chat, 'chat', 'production', 'lenient')).toBe(true))
  it('spoken strips trailing punctuation', () => expect(checkAnswer(hi, 'Hello.', 'recognition', 'lenient', true)).toBe(true))
})

describe('grade', () => {
  it('promotes a new card to box 2, due in a day', () => {
    const g = grade({ box: 1, correctStreak: 0, lapses: 0, reps: 0 }, true, T0)
    expect(g.box).toBe(2)
    expect(g.dueAt.getTime()).toBe(T0 + DUE_AFTER_MS[2])
  })

  it('sends a wrong answer back to box 1, parked for the relearn step', () => {
    const g = grade({ box: 4, correctStreak: 3, lapses: 1, reps: 8 }, false, T0)
    expect(g).toMatchObject({ box: 1, lapses: 2, correctStreak: 0, reps: 9 })
    expect(g.dueAt.getTime()).toBe(T0 + RELEARN_STEP_MS)
  })

  it('first arrival in box 5 uses the base 16-day interval', () => {
    const g = grade({ box: 4, correctStreak: 3, lapses: 0, reps: 3 }, true, T0)
    expect(g.box).toBe(5)
    expect(g.dueAt.getTime()).toBe(T0 + 16 * DAY)
  })

  it('keeps growing the interval for repeated top-box successes', () => {
    const second = grade({ box: 5, correctStreak: 4, lapses: 0, reps: 4 }, true, T0)
    const third = grade({ box: 5, correctStreak: 5, lapses: 0, reps: 5 }, true, T0)
    expect(second.box).toBe(5)
    expect(second.dueAt.getTime()).toBe(T0 + 40 * DAY)
    expect(third.dueAt.getTime()).toBe(T0 + 100 * DAY)
  })

  it('caps the interval at a year', () => {
    const g = grade({ box: 5, correctStreak: 40, lapses: 0, reps: 40 }, true, T0)
    expect(g.dueAt.getTime()).toBe(T0 + MAX_INTERVAL_MS)
  })
})

describe('intervalFor', () => {
  it('uses the fixed Leitner schedule below the top box', () => {
    for (const box of [2, 3, 4]) expect(intervalFor(box, box - 1)).toBe(DUE_AFTER_MS[box])
  })
  it('never shrinks as the streak grows', () => {
    let prev = 0
    for (let s = 4; s < 20; s++) {
      const ms = intervalFor(5, s)
      expect(ms).toBeGreaterThanOrEqual(prev)
      prev = ms
    }
  })
})

describe('cloze cards', () => {
  const card = { term: "Je bois un café le matin.", translation: 'I drink a coffee in the morning.', cloze: 'café' }

  it('blanks the first whole-word match, case-insensitively', () => {
    expect(clozePrompt(card.term, 'café')).toBe('Je bois un _____ le matin.')
    expect(clozePrompt('Le chat et la chatte', 'chat')).toBe('Le _____ et la chatte')
    expect(clozePrompt("C'est l'homme", "l'homme")).toBe("C'est _____")
    expect(clozePrompt('Bonjour', 'absent')).toBe('Bonjour (_____)')
  })

  it('expects the blanked word whatever the direction', () => {
    expect(checkAnswer(card, 'cafe', 'recognition', 'lenient')).toBe(true)
    expect(checkAnswer(card, 'Café', 'production', 'lenient')).toBe(true)
    expect(checkAnswer(card, 'coffee', 'recognition', 'lenient')).toBe(false)
  })
})
