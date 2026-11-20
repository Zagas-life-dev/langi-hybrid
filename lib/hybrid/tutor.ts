'use client'
// Browser-side tutor helpers. Same names and shapes as the old server `lib/ai.ts`, but every
// call goes through Firebase AI Logic via runTask(): on-device Gemini Nano when it can, cloud
// Flash otherwise, with a Hybrid HUD event per call. Server routes only persist results now.
import { Schema } from 'firebase/ai'
import { loadsJsonish } from '@/lib/jsonish'
import { langName } from '@/lib/langs'
import { scenarioByKey } from '@/lib/scenarios'
import { runTask } from './ai'
import type { HybridTask } from './tasks'
import { getHud, type HybridEvent } from './hud'

export { langName, scenarioByKey }
export { SCENARIOS } from '@/lib/scenarios'

export type ChatRole = 'system' | 'user' | 'assistant'
export interface ChatMessage { role: ChatRole; content: string }
export type ChatMode = 'conversation' | 'grammar'

const S = Schema
const str = () => S.string()
const strList = () => S.array({ items: S.string() })
const pairList = (a: string, b: string) =>
  S.array({ items: S.object({ properties: { [a]: S.string(), [b]: S.string() } }) })

/** Run one structured task. Falls back to salvaging JSON from the text if the schema parse failed. */
async function askEv<T>(task: HybridTask, system: string, user: string, schema: Schema): Promise<{ data: T | null; event: HybridEvent }> {
  const r = await runTask<T>(task, user, { instructions: system, schema })
  return { data: r.data ?? (loadsJsonish(r.text) as T | null), event: r.event }
}

async function ask<T>(task: HybridTask, system: string, user: string, schema: Schema): Promise<T | null> {
  return (await askEv<T>(task, system, user, schema)).data
}

/** Where the most recent AI helper ran, so a caller that only gets data back can still show a HybridBadge. */
export function lastAiBadge(): { source: 'ON_DEVICE' | 'IN_CLOUD'; ms: number; reason: string } | null {
  const e = getHud().events[0]
  return e ? { source: e.source, ms: e.ms, reason: e.reason } : null
}

/** Flatten chat history into one prompt: on-device sessions are single-turn. */
function transcript(history: ChatMessage[]): string {
  return history.map((m) => `${m.role === 'user' ? 'LEARNER' : 'LANGI'}: ${m.content}`).join('\n')
}

function focusClause(focus: string[] | undefined, how: string): string {
  if (!focus?.length) return ''
  return `The learner recently made these mistakes: ${focus.map((f) => `• ${f}`).join(' ')}. ${how} `
}

function cleanSuggestions(list: unknown): string[] {
  return (Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
}

const clampScore = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0
}

// --- Vocabulary helpers (on-device first) -------------------------------------

export async function generateExample(term: string, translation: string, lang: string) {
  const ln = langName(lang)
  const out = await ask<{ example?: string; translation?: string }>('explain',
    `You are a ${ln} teacher. Given a ${ln} word or phrase, write ONE short, natural ${ln} example sentence ` +
    `(A2 level, max 12 words) that uses it, plus a faithful English translation.`,
    `Word: "${term}" (means: ${translation})`,
    S.object({ properties: { example: str(), translation: str() } }))
  if (!out?.example) return null
  return { exampleSentence: String(out.example).trim(), exampleTranslation: String(out.translation || '').trim() }
}

export async function translateWord(term: string, lang: string, nativeLang = 'en') {
  const ln = langName(lang)
  const nn = langName(nativeLang)
  const out = await ask<{ translation?: string; partOfSpeech?: string; gender?: string; level?: string }>('explain',
    `You are a ${ln} dictionary. Given a ${ln} word or short phrase, return its ${nn} meaning (concise dictionary ` +
    `form, not a sentence), its part of speech, (for a noun) grammatical gender as "m", "f" or "mf" (else empty), ` +
    `and the CEFR level of the word as one of A1, A2, B1, B2, C1, C2.`,
    `${ln} term: "${term}"`,
    S.object({ properties: { translation: str(), partOfSpeech: str(), gender: str(), level: str() } }))
  const translation = String(out?.translation || '').trim()
  if (!translation) return null
  const gender = String(out?.gender || '').trim().toLowerCase()
  const level = String(out?.level || '').trim().toUpperCase()
  return {
    translation,
    partOfSpeech: String(out?.partOfSpeech || '').trim() || undefined,
    gender: ['m', 'f', 'mf'].includes(gender) ? gender : undefined,
    level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(level) ? level : undefined,
  }
}

export interface ContextTranslation {
  /** What the selected word/phrase means in THIS sentence (not the dictionary sense). */
  meaning: string
  /** Natural full-sentence translation. */
  sentence: string
  /** Word-for-word rendering, to show how the sentence is built. */
  literal: string
  /** Register, tone, idiom or connotation the dictionary misses. Empty if none. */
  nuance: string
  /** Grammar behind the form (tense, agreement, pronoun...). Empty if none. */
  grammar: string
  /** Other ways a native might say it, with a short note on when. */
  alternatives: string[]
  /** Where this answer was produced, for the Hybrid HUD badge. */
  badge?: { source: 'ON_DEVICE' | 'IN_CLOUD'; ms: number; reason: string }
}

/** Nuanced, context-aware translation of a selection plus the full sentence it sits in. */
export async function translateInContext(selection: string, sentence: string, lang: string, nativeLang = 'en', before = '', after = ''): Promise<ContextTranslation | null> {
  const ln = langName(lang)
  const nn = langName(nativeLang)
  const around = [before && `Before: ${before}`, after && `After: ${after}`].filter(Boolean).join('\n')
  // Tap to Explain prefers the device (short input, very frequent). If Nano can't fill the whole
  // structure, retry once on the chat route (cloud first) rather than show nothing.
  const system =
    `You are an expert ${ln}-${nn} translator and teacher. The learner selected a ${ln} word or phrase inside a ` +
    `sentence. Translate WITH CONTEXT, never in isolation. Answer in ${nn}.\n` +
    `- meaning: what the selection means in this exact sentence (pick the right sense; say if it is an idiom or part of a fixed expression).\n` +
    `- sentence: a natural, fluent ${nn} translation of the WHOLE sentence, as a native would say it, not word-for-word.\n` +
    `- literal: a word-for-word ${nn} gloss, so the learner sees the structure.\n` +
    `- nuance: register (formal/casual/slang), tone, implied meaning or cultural connotation. One or two sentences. Empty if nothing notable.\n` +
    `- grammar: the grammar that shapes this form (tense/mood, agreement, pronoun, word order). One sentence. Empty if nothing notable.\n` +
    `- alternatives: up to 2 other natural ${ln} ways to say the same thing, each followed by a short note on when it fits.`
  const user =
    `Selection: "${selection}"\nSentence: "${sentence}"${around ? `\n${around}` : ''}`
  const schema = S.object({ properties: { meaning: str(), sentence: str(), literal: str(), nuance: str(), grammar: str(), alternatives: strList() } })
  let res = await askEv<Partial<ContextTranslation>>('explain', system, user, schema).catch(() => null)
  if (!res?.data?.meaning && !res?.data?.sentence) res = await askEv<Partial<ContextTranslation>>('chat', system, user, schema)
  const out = res.data
  const meaning = String(out?.meaning || '').trim()
  const full = String(out?.sentence || '').trim()
  if (!meaning && !full) return null
  return {
    meaning,
    sentence: full,
    literal: String(out?.literal || '').trim(),
    nuance: String(out?.nuance || '').trim(),
    grammar: String(out?.grammar || '').trim(),
    alternatives: (Array.isArray(out?.alternatives) ? out!.alternatives : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 2),
    badge: { source: res.event.source, ms: res.event.ms, reason: res.event.reason },
  }
}

export async function generateDistractors(term: string, translation: string, lang: string): Promise<string[]> {
  const ln = langName(lang)
  const out = await ask<{ distractors?: string[] }>('classify',
    `You write multiple-choice distractors for a ${ln} vocabulary quiz. Given the correct English meaning of a ` +
    `${ln} word, return exactly 3 plausible but INCORRECT English meanings (same part of speech, similar register, ` +
    `never synonyms of the correct one).`,
    `${ln} word: "${term}". Correct meaning: "${translation}".`,
    S.object({ properties: { distractors: strList() } }))
  const list = Array.isArray(out?.distractors) ? out!.distractors : []
  return list.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
}

// --- Sentence practice ----------------------------------------------------------

export async function generateSentencePrompt(level: string, lang: string, focus?: string[], recent: string[] = []): Promise<string> {
  const ln = langName(lang)
  // Nano answers the same way every time, so force variety: a random topic, plus the last few sentences to avoid.
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)]
  const out = await ask<{ prompt?: string }>('explain',
    `You are a ${ln} writing coach. Produce ONE short, natural English sentence for a ${level} learner to ` +
    `translate into ${ln}. Match their level (simpler for A1/A2, richer for B1+). Vary the topic. ` +
    focusClause(focus, 'About half the time, write a sentence whose translation needs one of those forms.') +
    (recent.length ? `Do NOT repeat or closely copy any of these earlier sentences: ${recent.map((r) => `"${r}"`).join(' ')}. ` : ''),
    `Give me a new level-${level} sentence to translate. Topic idea: ${topic}. (variation ${Math.floor(Math.random() * 1000)})`,
    S.object({ properties: { prompt: str() } }))
  return String(out?.prompt || '').trim()
}

export interface SentenceGrade { score: number; feedback: string; correction: string }

export async function gradeSentence(promptEnglish: string, sentence: string, level: string, lang: string): Promise<SentenceGrade> {
  const ln = langName(lang)
  const out = await ask<{ score?: number; feedback?: string; correction?: string }>('grade',
    `You are a supportive ${ln} writing examiner. The student translated an English sentence into ${ln}. ` +
    `Judge accuracy, grammar and naturalness for a ${level} learner. Be encouraging but precise. ` +
    `score is an integer 0-100, feedback is short English, correction is one correct, natural ${ln} translation.`,
    `English: "${promptEnglish}"\nStudent's ${ln}: "${sentence}"`,
    S.object({ properties: { score: S.integer(), feedback: str(), correction: str() } }))
  return {
    score: clampScore(out?.score),
    feedback: String(out?.feedback || '').trim(),
    correction: String(out?.correction || '').trim(),
  }
}

// --- Conversation tutor ("Langi") -------------------------------------------------

const TOPICS = [
  'your daily routine', 'food and cooking', 'travel and holidays', 'films and TV',
  'the weather today', 'your last weekend', 'hobbies and free time', 'work or studies',
  'your family', 'sports', 'music', 'dreams and goals', 'city versus countryside',
  'technology in daily life', 'the environment', 'a memorable meal', 'languages and learning',
  'animals and pets', 'shopping', 'a place you would love to visit',
]
export const randomTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)]

export async function conversationStarter(args: { topic?: string; scenario?: string; level: string; lang: string; focus?: string[] }) {
  const { topic, scenario, level, lang, focus } = args
  const ln = langName(lang)
  const sc = scenarioByKey(scenario)
  const setup = sc
    ? `Role-play — ${sc.setting} Open the scene IN CHARACTER`
    : `Start a short, friendly conversation about "${topic}"`
  const out = await ask<{ opener?: string; translation?: string; suggestions?: string[] }>('chat',
    `You are Langi, a warm ${ln} conversation partner for a ${level} learner. ${setup} in ${ln}: one or two simple, ` +
    `${level}-appropriate sentences ending with a question. Also give 2–3 short ${ln} replies the learner could send ` +
    `back (at their level). ` +
    focusClause(focus, 'If natural, phrase your question so answering it lets them use those forms correctly.') +
    `opener is in ${ln}, translation is English, suggestions are in ${ln}.`,
    sc ? `Scenario: ${sc.label}` : `Topic: ${topic}`,
    S.object({ properties: { opener: str(), translation: str(), suggestions: strList() } }))
  if (!out?.opener) return null
  return {
    opener: String(out.opener).trim(),
    translation: String(out.translation || '').trim(),
    suggestions: cleanSuggestions(out.suggestions),
  }
}

export interface TutorVocab { term: string; translation: string }
export interface TutorReply { reply: string; corrections: string; corrected: string; vocab: TutorVocab[]; suggestions: string[] }

export async function tutorReply(args: {
  history: ChatMessage[]
  mode: ChatMode
  topic?: string | null
  scenario?: string | null
  level: string
  lang: string
  focus?: string[]
}): Promise<TutorReply> {
  const { history, mode, topic, scenario, level, lang, focus } = args
  const ln = langName(lang)
  const sc = scenarioByKey(scenario ?? undefined)

  const shared =
    `- If the learner asks what something means, how to say something, asks in English, or is clearly confused, ` +
    `ANSWER IN ENGLISH — explain simply with a short ${ln} example. Never treat such a help-question as a sentence to correct.\n` +
    `- vocab: list up to 3 {term,translation} for ${ln} words/phrases the learner asked about or should study from ` +
    `this turn (term in ${ln}, translation in English). Empty array if none.\n` +
    `- suggestions: 2–3 short, natural ${ln} replies the learner could send next, at their level. Empty in grammar mode.\n` +
    (focus?.length
      ? `- ${focusClause(focus, 'Now and then steer the conversation so they need those forms again, and watch for the same slip.')}\n`
      : '')

  const convoLead = sc
    ? `You are Langi, role-playing with a ${level} ${ln} learner. ROLE: ${sc.setting} Stay IN CHARACTER, speak only ` +
      `${ln} at the learner's level (very simple for A1/A2), keep replies short (1–2 sentences), and end with a ` +
      `question that moves the scene forward. The learner is trying to: ${sc.goals.join('; ')} — give them natural ` +
      `openings to do each of these, but never do them for the learner.\n`
    : `You are Langi, a friendly ${ln} conversation partner for a ${level} learner.\n` +
      `- Normally chat in ${ln}${topic ? ` about "${topic}"` : ''}, MATCHING the learner's level: use ${level}-` +
      `appropriate words and grammar (for A1/A2 keep it very simple and short, 1–2 sentences), and end with a question.\n`

  const system = mode === 'grammar'
    ? `You are Langi, a patient ${ln} tutor for a ${level} learner. Answer the question clearly in English with ` +
      `short ${ln} examples. Be concise.\n${shared}Leave corrections and corrected empty.`
    : `${convoLead}${shared}` +
      `- corrections: only when the learner WROTE ${ln} with mistakes that affect meaning or grammar, give a short ` +
      `English note; ignore minor punctuation/spacing. Leave empty otherwise.\n` +
      `- corrected: when corrections is non-empty, the learner's sentence rewritten correctly in ${ln}. Else empty.\n` +
      `- reply: your ${ln} reply (or English if it is a help-question).`

  const out = await ask<{ reply?: string; corrections?: string; corrected?: string; vocab?: TutorVocab[]; suggestions?: string[] }>('chat',
    system,
    // Only the last ~10 turns go to the model, and on-device is single-turn, so send a transcript.
    `${transcript(history.slice(-10))}\nLANGI:`,
    S.object({ properties: {
      reply: str(), corrections: str(), corrected: str(),
      vocab: pairList('term', 'translation'), suggestions: strList(),
    } }))
  const vocab = (Array.isArray(out?.vocab) ? out!.vocab : [])
    .map((v) => ({ term: String(v?.term || '').trim(), translation: String(v?.translation || '').trim() }))
    .filter((v) => v.term && v.translation)
    .slice(0, 3)
  return {
    reply: String(out?.reply || '').trim() || '…',
    corrections: String(out?.corrections || '').trim(),
    corrected: String(out?.corrected || '').trim(),
    vocab,
    suggestions: mode === 'grammar' ? [] : cleanSuggestions(out?.suggestions),
  }
}

export interface ScenarioDebrief {
  score: number
  goalsMet: boolean[]
  feedback: string
  phrases: { phrase: string; translation: string }[]
}

export async function scenarioDebrief(args: {
  history: ChatMessage[]
  scenario: string
  level: string
  lang: string
}): Promise<ScenarioDebrief | null> {
  const sc = scenarioByKey(args.scenario)
  if (!sc) return null
  const ln = langName(args.lang)
  const out = await ask<{ score?: number; goalsMet?: unknown[]; feedback?: string; phrases?: { phrase?: string; translation?: string }[] }>('deepDive',
    `You are a kind but honest ${ln} speaking examiner. A ${args.level} learner just did a role-play: ${sc.setting} ` +
    `Their goals were:\n${sc.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}\n` +
    `Judge ONLY the LEARNER's lines. A goal counts as met if the learner did it themselves in understandable ${ln} ` +
    `(small errors are fine). score: 0–100 for how well they handled the situation at their level. goalsMet: one ` +
    `boolean per goal, in order. feedback: 1–2 sentences of English. phrases: 2–3 short ${ln} phrases that would ` +
    `have helped, with English translations.`,
    transcript(args.history.slice(-24)),
    S.object({ properties: {
      score: S.integer(), goalsMet: S.array({ items: S.boolean() }),
      feedback: str(), phrases: pairList('phrase', 'translation'),
    } }))
  if (!out) return null
  const raw = Array.isArray(out.goalsMet) ? out.goalsMet : []
  return {
    score: clampScore(out.score),
    goalsMet: sc.goals.map((_, i) => raw[i] === true || raw[i] === 'true'),
    feedback: String(out.feedback || '').trim(),
    phrases: (Array.isArray(out.phrases) ? out.phrases : [])
      .map((p) => ({ phrase: String(p?.phrase || '').trim(), translation: String(p?.translation || '').trim() }))
      .filter((p) => p.phrase)
      .slice(0, 3),
  }
}
