import { chatJson, langName } from '@/lib/ai'
import { langName as nativeName } from '@/lib/langs'
import type { CefrLevel } from '@/lib/models/LangiUser'

// AI dictation generator: a batch of level-appropriate target-language sentences
// the learner hears (TTS) and types back. Scoring is done client-side by
// lib/pronunciation.ts (typed answer vs target), so this only needs to produce
// good sentences + a translation to reveal afterwards.

export interface DictationLine {
  text: string
  translation: string
}

function lengthHint(level: CefrLevel): string {
  switch (level) {
    case 'A1': return '4–7 words, present tense, very common words'
    case 'A2': return '6–9 words, everyday vocabulary'
    case 'B1': return '8–12 words, some subordinate clauses'
    case 'B2': return '10–14 words, richer vocabulary'
    case 'C1': return '12–16 words, sophisticated vocabulary and structures'
    case 'C2': return '12–18 words, idiomatic and stylistically varied'
  }
}

export async function generateDictation(args: {
  level: CefrLevel
  lang: string
  count?: number
  nativeLang?: string
}): Promise<DictationLine[]> {
  const { level, lang, count = 6, nativeLang = 'en' } = args
  const ln = langName(lang)
  const nn = nativeName(nativeLang)
  const out = await chatJson<{ lines?: DictationLine[] }>([
    {
      role: 'system',
      content:
        `You are a ${ln} dictation coach for a CEFR ${level} learner. Produce ${count} natural, standalone ${ln} ` +
        `sentences for listening dictation (${lengthHint(level)}). Vary the topic and structure; avoid proper nouns ` +
        `that are hard to spell. Give a ${nn} translation for each. ` +
        `Return ONLY JSON: {"lines":[{"text":"<${ln} sentence>","translation":"<${nn}>"}]}. Use correct accents.`,
    },
    { role: 'user', content: `Give me ${count} level-${level} dictation sentences.` },
  ], { temperature: 0.9, maxTokens: 900 })

  return (Array.isArray(out?.lines) ? out!.lines : [])
    .map((l) => ({ text: String(l?.text || '').trim(), translation: String(l?.translation || '').trim() }))
    .filter((l) => l.text)
    .slice(0, count)
}
