'use client'
// Content generators that used to run on the server with direct model calls. They now run in the
// browser through Firebase AI Logic like every other AI action, so routing, App Check and the
// Hybrid HUD apply: dictation sentences prefer the device (short, frequent), graded stories go to
// the cloud (long, structured, quality matters).
import { Schema } from 'firebase/ai'
import { loadsJsonish } from '@/lib/jsonish'
import { langName } from '@/lib/langs'
import { genreByKey, genrePromptHint, maturityHint } from '@/lib/genres'
import { parseDictationLines } from './linesCore'
import { cleanStory, type GeneratedStory } from './storyCore'
import { runTask } from './ai'

type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface LearnerContext { level: string; lang: string; focus: string[] }

const CTX_KEY = 'langi.chatCtx' // shared with the chat window, so one cached profile serves both

/** The learner's level and target language. Cached after the first online load so this works offline. */
export async function getLearnerContext(fallbackLang: string): Promise<LearnerContext> {
  try {
    const res = await fetch('/api/chat/context')
    if (!res.ok) throw new Error('profile')
    const ctx = (await res.json()) as LearnerContext
    try { localStorage.setItem(CTX_KEY, JSON.stringify(ctx)) } catch { /* private mode */ }
    return ctx
  } catch {
    try {
      const cached = JSON.parse(localStorage.getItem(CTX_KEY) || 'null') as LearnerContext | null
      if (cached?.level) return cached
    } catch { /* fall through */ }
    return { level: 'A2', lang: fallbackLang, focus: [] }
  }
}

// --- Dictation -----------------------------------------------------------------------------------

function lengthHint(level: Level): string {
  switch (level) {
    case 'A1': return '4–7 words, present tense, very common words'
    case 'A2': return '6–9 words, everyday vocabulary'
    case 'B1': return '8–12 words, some subordinate clauses'
    case 'B2': return '10–14 words, richer vocabulary'
    case 'C1': return '12–16 words, sophisticated vocabulary and structures'
    case 'C2': return '12–18 words, idiomatic and stylistically varied'
  }
}

export interface DictationLine { text: string; translation: string }

/** A batch of level-appropriate sentences the learner hears and types back. Plain lines: fastest on Nano. */
export async function generateDictationLines(args: { level: string; lang: string; nativeLang?: string; count?: number }): Promise<DictationLine[]> {
  const { lang, nativeLang = 'en', count = 6 } = args
  const level = (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(args.level) ? args.level : 'A2') as Level
  const ln = langName(lang)
  const nn = langName(nativeLang)
  const r = await runTask('explain', `Give me ${count} level-${level} dictation sentences. Variation ${Math.floor(Math.random() * 1000)}.`, {
    instructions:
      `You are a ${ln} dictation coach for a CEFR ${level} learner. Write ${count} natural, standalone ${ln} sentences ` +
      `for listening dictation (${lengthHint(level)}). Vary the topic and structure; avoid proper nouns that are hard to ` +
      `spell; use correct accents. One per line in exactly this format: ${ln} sentence | ${nn} translation. No numbering.`,
  })
  return parseDictationLines(r.text, count)
}

// --- Graded stories ----------------------------------------------------------------------------------

// Length and richness scale with level so A1 isn't a wall of text and C2 isn't trivial.
function shape(level: Level): { sentences: string; note: string } {
  switch (level) {
    case 'A1': return { sentences: '6–8 very short, simple sentences (present tense, high-frequency words)', note: 'Keep vocabulary tiny and concrete.' }
    case 'A2': return { sentences: '8–10 short sentences (present + passé composé, everyday vocabulary)', note: 'Simple connected narrative.' }
    case 'B1': return { sentences: '10–12 sentences with some variety of tenses and connectors', note: 'A clear beginning, middle and end.' }
    case 'B2': return { sentences: '12–14 sentences with richer vocabulary, subordinate clauses and some idiom', note: 'Some nuance and opinion.' }
    case 'C1': return { sentences: '12–16 sentences with sophisticated vocabulary, varied register and subtlety', note: 'Allow figurative language and complex syntax.' }
    case 'C2': return { sentences: '14–18 sentences with near-native sophistication, idiom and stylistic flair', note: 'Literary, precise, idiomatic.' }
  }
}

const storySchema = Schema.object({
  properties: {
    title: Schema.string(),
    titleTranslation: Schema.string(),
    sentences: Schema.array({ items: Schema.object({ properties: { text: Schema.string(), translation: Schema.string() } }) }),
    glossary: Schema.array({ items: Schema.object({ properties: { term: Schema.string(), translation: Schema.string() } }) }),
    questions: Schema.array({
      items: Schema.object({ properties: { question: Schema.string(), options: Schema.array({ items: Schema.string() }), answer: Schema.integer() } }),
    }),
  },
})

/** A graded story with per-sentence translations, a glossary and comprehension questions (cloud task). */
export async function generateStory(args: {
  level: string
  lang: string
  topic?: string
  nativeLang?: string
  genre?: string
  premise?: string
  mature?: boolean
}): Promise<GeneratedStory | null> {
  const { lang, topic, nativeLang = 'en', genre, premise, mature = false } = args
  const level = (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(args.level) ? args.level : 'A2') as Level
  const ln = langName(lang)
  const nn = langName(nativeLang)
  const s = shape(level)
  const g = genreByKey(genre)
  // The genre scaffold gives the model tropes, a setting and a premise so plots have depth.
  // The maturity guardrail is always present (genre-specific or standalone).
  const styleLine = g ? ` ${genrePromptHint(g, premise, mature)}` : ` ${maturityHint(mature)}`
  const ask = topic
    ? `Write the story about: ${topic}.${g ? ` In the ${g.label} genre.` : ''}`
    : g ? `Write a ${g.label} story.` : 'Write a story on any everyday theme.'

  const r = await runTask<GeneratedStory>('chat', ask, {
    instructions:
      `You are an expert ${ln} teacher who writes engaging graded readers. Write an ORIGINAL ${ln} story for a CEFR ` +
      `${level} learner: ${s.sentences}. ${s.note}${styleLine} Then give a faithful ${nn} translation of EACH sentence, ` +
      `a glossary of 5–8 of the trickiest words (${ln} term, ${nn} translation), and 3 comprehension questions written ` +
      `in ${nn} with 4 options each and answer = the index (0-3) of the correct option. title is in ${ln}, titleTranslation ` +
      `in ${nn}. Use natural ${ln} with correct accents. Each sentence must be a single sentence.`,
    schema: storySchema,
  })
  const out = (r.data ?? (loadsJsonish(r.text) as GeneratedStory | null))
  return out ? cleanStory(out) : null
}

export type { GeneratedStory }
