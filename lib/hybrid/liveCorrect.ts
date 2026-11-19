'use client'
// Live Correct + Deep Dive, both through Firebase AI Logic.
//  - checkText: "liveCorrect" task, prefers on-device Gemini Nano (instant, free, offline).
//  - deepDive:  "deepDive" task, prefers the cloud (long, structured, quality over speed).
import { langName } from '@/lib/langs'
import { runTask, type HybridResult } from './ai'
import { correctionInstructions, parseCorrection, type Correction, type Mistake } from './correctCore'

export interface CheckResult extends Correction {
  source: HybridResult['source']
  ms: number
  firstTokenMs: number | null
  reason: string
}

export async function checkText(text: string, lang: string, onText?: (soFar: string) => void): Promise<CheckResult> {
  const r = await runTask('liveCorrect', text, { instructions: correctionInstructions(langName(lang), lang), onText })
  return {
    ...parseCorrection(r.text, text),
    source: r.source,
    ms: r.event.ms,
    firstTokenMs: r.firstTokenMs,
    reason: r.event.reason,
  }
}

/** One tap → a full cloud breakdown of a single mistake, streamed. */
export async function deepDive(args: {
  sentence: string
  mistake?: Mistake
  lang: string
  level: string
  onText?: (soFar: string) => void
}): Promise<{ text: string; source: HybridResult['source']; ms: number; reason: string }> {
  const ln = langName(args.lang)
  const focus = args.mistake
    ? `The mistake: "${args.mistake.wrong}" should be "${args.mistake.right}"${args.mistake.why ? ` (${args.mistake.why})` : ''}.`
    : 'Find and explain the most important mistake.'
  const r = await runTask('deepDive', `${ln} sentence: ${args.sentence}\n${focus}`, {
    instructions:
      `You are a patient ${ln} tutor for a ${args.level} learner who speaks English. Give a full grammar breakdown ` +
      `in English with these short sections: **The rule** (2-3 sentences), **Corrected** (the sentence), ` +
      `**Examples** (3 short ${ln} examples with English translations), **Common trap** (1 sentence). Be concise.`,
    onText: args.onText,
  })
  return { text: r.text, source: r.source, ms: r.event.ms, reason: r.event.reason }
}
