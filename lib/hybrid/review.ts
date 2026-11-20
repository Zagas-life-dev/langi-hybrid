'use client'
// Offline Review: when the rules mark a typed answer wrong, a second opinion from Gemini Nano
// (Firebase AI Logic "grade" task: on-device first, on-device only when offline) decides whether
// it is a valid synonym or a harmless slip. Free, private, and works with no connection.
import { langName } from '@/lib/langs'
import { runTask } from './ai'
import { judgeInstructions, parseVerdict, type Verdict } from './reviewCore'

export interface JudgeResult extends Verdict {
  badge: { source: 'ON_DEVICE' | 'IN_CLOUD'; ms: number; reason: string }
}

const TIMEOUT_MS = 8000

/** Returns null when the AI can't answer in time: the rules' verdict then stands. */
export async function judgeAnswer(args: {
  term: string
  translation: string
  answer: string
  direction: 'recognition' | 'production'
  lang: string
  nativeLang: string
}): Promise<JudgeResult | null> {
  const shown = args.direction === 'recognition' ? args.term : args.translation
  const expected = args.direction === 'recognition' ? args.translation : args.term
  const prompt = `Word shown: "${shown}"\nExpected answer: "${expected}"\nLearner's answer: "${args.answer}"`
  try {
    const r = await Promise.race([
      runTask('grade', prompt, {
        instructions: judgeInstructions({ learningName: langName(args.lang), nativeName: langName(args.nativeLang), direction: args.direction }),
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ])
    if (!r) return null
    const v = parseVerdict(r.text)
    return { ...v, badge: { source: r.source, ms: r.event.ms, reason: r.event.reason } }
  } catch {
    return null
  }
}
