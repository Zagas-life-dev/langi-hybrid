import { connectDB } from '@/lib/db'
import AiBackendState from '@/lib/models/AiBackendState'
import { geminiKeys } from '@/lib/geminiKeys'
import { loadsJsonish } from '@/lib/jsonish'

// ---------------------------------------------------------------------------
// Provider-agnostic chat cascade — TypeScript port of Scraper/utils/ai_extractor.py.
// Tries backends in AI_CHAT_BACKENDS order (default mistral,gemini). 'gemini'
// expands to every configured Gemini key — the primary, then GEMINI_API_KEY_2
// ('gemini2') as a backup, each with its own cooldown. On a 429/503
// the backend is parked in the AiBackendState Mongo doc (so the back-off survives
// restarts) and the next backend takes over. Picks the cheapest/best available.
// ---------------------------------------------------------------------------

export type ChatRole = 'system' | 'user' | 'assistant'
export interface ChatMessage { role: ChatRole; content: string }
export interface ChatOpts { json?: boolean; temperature?: number; maxTokens?: number }

const COOLDOWN_MS = (parseInt(process.env.AI_RATE_LIMIT_COOLDOWN || '30', 10) || 30) * 1000

function backendOrder(): string[] {
  const hasBackup = geminiKeys().some((k) => k.id === 'backup')
  const names = (process.env.AI_CHAT_BACKENDS || 'mistral,gemini')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .flatMap((s) => (s === 'gemini' && hasBackup ? ['gemini', 'gemini2'] : [s]))
    .filter((s) => s === 'mistral' || s === 'gemini' || (s === 'gemini2' && hasBackup))
  return [...new Set(names)]
}

class RateLimitError extends Error {}

// Read-through cooldown cache in process memory to avoid a DB read on every call.
const cooldownCache = new Map<string, number>()

async function isCooled(name: string): Promise<boolean> {
  const mem = cooldownCache.get(name) || 0
  if (mem > Date.now()) return true
  await connectDB()
  const doc = await AiBackendState.findOne({ backend: name }).lean()
  const until = doc?.cooldownUntil ? new Date(doc.cooldownUntil).getTime() : 0
  if (until > Date.now()) {
    cooldownCache.set(name, until)
    return true
  }
  return false
}

async function park(name: string) {
  const until = Date.now() + COOLDOWN_MS
  cooldownCache.set(name, until)
  await connectDB()
  await AiBackendState.updateOne(
    { backend: name },
    { $set: { cooldownUntil: new Date(until) } },
    { upsert: true }
  )
  console.warn(`[AI ${name}] rate-limited; backing off ${COOLDOWN_MS / 1000}s, switching to backup`)
}

// --- Backends --------------------------------------------------------------

async function callMistral(messages: ChatMessage[], opts: ChatOpts): Promise<string> {
  const key = process.env.MISTRAL_API_KEY
  if (!key) throw new Error('MISTRAL_API_KEY not set')
  const model = process.env.MISTRAL_MODEL || 'mistral-small-latest'
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 800,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (res.status === 429 || res.status === 503) throw new RateLimitError()
  if (!res.ok) throw new Error(`Mistral HTTP ${res.status}`)
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

// Chat models to try, in order. Google retires older models per PROJECT (a new
// project's key gets 404 for gemini-2.5-flash-lite while an older project's key
// still works), so a 404 moves on to the next model instead of failing.
function geminiModels(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash-lite')
    .split(',').map((s) => s.trim()).filter(Boolean)
  return [...new Set([process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite', ...fallbacks])]
}

// (key id → model) pairs that returned 404, so later calls skip straight past them.
const retiredModels = new Set<string>()

async function callGemini(messages: ChatMessage[], opts: ChatOpts, which: 'primary' | 'backup' = 'primary'): Promise<string> {
  const key = geminiKeys().find((k) => k.id === which)?.key
  if (!key) throw new Error(which === 'primary' ? 'GEMINI_API_KEY not set' : 'GEMINI_API_KEY_2 not set')
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
  const body = JSON.stringify({
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.6,
      maxOutputTokens: opts.maxTokens ?? 800,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  })

  for (const model of geminiModels()) {
    if (retiredModels.has(`${which}:${model}`)) continue
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    )
    if (res.status === 404) {
      retiredModels.add(`${which}:${model}`)
      console.warn(`[AI gemini:${which}] ${model} unavailable for this key; trying the next model`)
      continue
    }
    if (res.status === 429 || res.status === 503) throw new RateLimitError()
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts ?? []
    return parts.map((p: { text?: string }) => p.text ?? '').join('')
  }
  throw new Error(`No available Gemini model for the ${which} key (${geminiModels().join(', ')})`)
}

const CALLERS: Record<string, (m: ChatMessage[], o: ChatOpts) => Promise<string>> = {
  mistral: callMistral,
  gemini: (m, o) => callGemini(m, o, 'primary'),
  gemini2: (m, o) => callGemini(m, o, 'backup'),
}

/** Run the cascade and return the assistant's text. Throws if all backends fail. */
export async function chat(messages: ChatMessage[], opts: ChatOpts = {}): Promise<string> {
  let lastErr: unknown
  for (const name of backendOrder()) {
    if (await isCooled(name)) continue
    try {
      const text = await CALLERS[name](messages, opts)
      if (text && text.trim()) return text
    } catch (e) {
      lastErr = e
      if (e instanceof RateLimitError) await park(name)
      else console.warn(`[AI ${name}] failed:`, (e as Error).message)
    }
  }
  throw new Error(`All AI backends unavailable${lastErr ? `: ${(lastErr as Error).message}` : ''}`)
}

/** Convenience: chat in JSON mode and parse the result (with salvage). */
export async function chatJson<T = unknown>(messages: ChatMessage[], opts: ChatOpts = {}): Promise<T | null> {
  const text = await chat(messages, { ...opts, json: true })
  return loadsJsonish(text) as T | null
}

export { langName } from '@/lib/langs'
import { langName } from '@/lib/langs'

// --- High-level helpers (vocabulary enrichment) ----------------------------

/** A short example sentence using `term`, plus its English translation. */
export async function generateExample(term: string, translation: string, lang: string) {
  const ln = langName(lang)
  const out = await chatJson<{ example?: string; translation?: string }>([
    {
      role: 'system',
      content:
        `You are a ${ln} teacher. Given a ${ln} word or phrase, write ONE short, natural ${ln} ` +
        `example sentence (A2 level, max 12 words) that uses it, plus a faithful English translation. ` +
        `Reply as JSON: {"example": "...", "translation": "..."}.`,
    },
    { role: 'user', content: `Word: "${term}" (means: ${translation})` },
  ], { temperature: 0.7, maxTokens: 200 })
  if (!out?.example) return null
  return { exampleSentence: String(out.example).trim(), exampleTranslation: String(out.translation || '').trim() }
}

/**
 * Translate a single word/short phrase a learner heard in a video into their
 * native language, with light grammatical info. Used by the "save word to deck"
 * flow so a watched word becomes an SRS card.
 */
export async function translateWord(term: string, lang: string, nativeLang = 'en') {
  const ln = langName(lang)
  const nn = langName(nativeLang)
  const out = await chatJson<{ translation?: string; partOfSpeech?: string; gender?: string; level?: string }>([
    {
      role: 'system',
      content:
        `You are a ${ln} dictionary. Given a ${ln} word or short phrase, return its ${nn} ` +
        `meaning plus its part of speech, (for a noun) grammatical gender as "m", "f", or "mf", and the CEFR ` +
        `difficulty level of the word as one of A1, A2, B1, B2, C1, C2. ` +
        `Keep the translation concise (the dictionary form, not a sentence). ` +
        `Reply as JSON: {"translation": "...", "partOfSpeech": "...", "gender": "...", "level": "A1"}.`,
    },
    { role: 'user', content: `${ln} term: "${term}"` },
  ], { temperature: 0.3, maxTokens: 140 })
  const translation = String(out?.translation || '').trim()
  if (!translation) return null
  const gender = String(out?.gender || '').trim().toLowerCase()
  const level = String(out?.level || '').trim().toUpperCase()
  const VALID_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  return {
    translation,
    partOfSpeech: String(out?.partOfSpeech || '').trim() || undefined,
    gender: ['m', 'f', 'mf'].includes(gender) ? gender : undefined,
    level: (VALID_LEVELS.includes(level) ? level : undefined) as import('@/lib/models/LangiUser').CefrLevel | undefined,
  }
}

/** Three plausible-but-wrong English meanings for multiple-choice mode. */
export async function generateDistractors(term: string, translation: string, lang: string): Promise<string[]> {
  const ln = langName(lang)
  const out = await chatJson<{ distractors?: string[] }>([
    {
      role: 'system',
      content:
        `You write multiple-choice distractors for a ${ln} vocabulary quiz. Given the correct English ` +
        `meaning of a ${ln} word, return exactly 3 plausible but INCORRECT English meanings (same part of ` +
        `speech, similar register, never synonyms of the correct one). Reply as JSON: {"distractors": ["..","..",".."]}.`,
    },
    { role: 'user', content: `${ln} word: "${term}". Correct meaning: "${translation}".` },
  ], { temperature: 0.8, maxTokens: 200 })
  const list = Array.isArray(out?.distractors) ? out!.distractors : []
  return list.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
}

// --- Conversation tutor ("Langi") ------------------------------------------

export type ChatMode = 'conversation' | 'grammar'

// A pool of friendly, level-agnostic conversation topics — no AI call needed.
const TOPICS = [
  'your daily routine', 'food and cooking', 'travel and holidays', 'films and TV',
  'the weather today', 'your last weekend', 'hobbies and free time', 'work or studies',
  'your family', 'sports', 'music', 'dreams and goals', 'city versus countryside',
  'technology in daily life', 'the environment', 'a memorable meal', 'languages and learning',
  'animals and pets', 'shopping', 'a place you would love to visit',
]

export function randomTopic(): string {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)]
}

// Role-play scenarios live in a client-safe module so the chat UI shares them.
export { SCENARIOS, scenarioByKey, type Scenario } from '@/lib/scenarios'
import { scenarioByKey } from '@/lib/scenarios'

/** A prompt fragment asking the model to weave in the learner's weak spots. */
function focusClause(focus: string[] | undefined, how: string): string {
  if (!focus?.length) return ''
  return `The learner recently made these mistakes: ${focus.map((f) => `• ${f}`).join(' ')}. ${how} `
}

/** Tidy a model-provided list of suggested learner replies. */
function cleanSuggestions(list: unknown): string[] {
  return (Array.isArray(list) ? list : [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 3)
}

/** A short welcoming opener in the target language, plus suggested replies. For a
 * role-play scenario Langi opens the scene in character. */
export async function conversationStarter(args: { topic?: string; scenario?: string; level: string; lang: string; focus?: string[] }) {
  const { topic, scenario, level, lang, focus } = args
  const ln = langName(lang)
  const sc = scenarioByKey(scenario)
  const setup = sc
    ? `Role-play — ${sc.setting} Open the scene IN CHARACTER`
    : `Start a short, friendly conversation about "${topic}"`
  const out = await chatJson<{ opener?: string; translation?: string; suggestions?: string[] }>([
    {
      role: 'system',
      content:
        `You are Langi, a warm ${ln} conversation partner for a ${level} learner. ${setup} in ${ln}: ` +
        `one or two simple, ${level}-appropriate sentences ending with a question. Also give 2–3 short ${ln} ` +
        `replies the learner could send back (at their level). ` +
        focusClause(focus, 'If natural, phrase your question so answering it lets them use those forms correctly.') +
        `Reply ONLY as JSON: {"opener":"<${ln}>","translation":"<English>","suggestions":["<${ln}>"]}.`,
    },
    { role: 'user', content: sc ? `Scenario: ${sc.label}` : `Topic: ${topic}` },
  ], { temperature: 0.9, maxTokens: 320 })
  if (!out?.opener) return null
  return {
    opener: String(out.opener).trim(),
    translation: String(out.translation || '').trim(),
    suggestions: cleanSuggestions(out.suggestions),
  }
}

export interface TutorVocab { term: string; translation: string }
export interface TutorReply { reply: string; corrections: string; corrected: string; vocab: TutorVocab[]; suggestions: string[] }

/** Continue a tutoring conversation. Returns the reply, gentle corrections, any
 * vocabulary the learner asked about (saved to their deck), and suggested next
 * replies. Plays a character when a role-play `scenario` is set. */
export async function tutorReply(args: {
  history: ChatMessage[]
  mode: ChatMode
  topic?: string
  scenario?: string
  level: string
  lang: string
  focus?: string[]
}): Promise<TutorReply> {
  const { history, mode, topic, scenario, level, lang, focus } = args
  const ln = langName(lang)
  const sc = scenarioByKey(scenario)

  // Shared rules: explain in English on demand + capture asked-about vocab.
  const shared =
    `- If the learner asks what something means, how to say something, asks in English, or is clearly ` +
    `confused, ANSWER IN ENGLISH — explain simply with a short ${ln} example. Never treat such a ` +
    `help-question as a sentence to correct.\n` +
    `- vocab: list up to 3 {term,translation} for ${ln} words/phrases the learner asked about or should ` +
    `study from this turn (term in ${ln}, translation in English). Empty array if none.\n` +
    `- suggestions: 2–3 short, natural ${ln} replies the learner could send next, at their level. Empty in grammar mode.\n` +
    (focus?.length
      ? `- ${focusClause(focus, 'Now and then steer the conversation so they need those forms again, and watch for the same slip.')}\n`
      : '')

  const convoLead = sc
    ? `You are Langi, role-playing with a ${level} ${ln} learner. ROLE: ${sc.setting} Stay IN CHARACTER, ` +
      `speak only ${ln} at the learner's level (very simple for A1/A2), keep replies short (1–2 sentences), ` +
      `and end with a question that moves the scene forward. The learner is trying to: ${sc.goals.join('; ')} — ` +
      `give them natural openings to do each of these, but never do them for the learner.\n`
    : `You are Langi, a friendly ${ln} conversation partner for a ${level} learner.\n` +
      `- Normally chat in ${ln}${topic ? ` about "${topic}"` : ''}, MATCHING the learner's level: use ${level}-` +
      `appropriate words and grammar (for A1/A2 keep it very simple and short, 1–2 sentences), and end with a question.\n`

  const system =
    mode === 'grammar'
      ? `You are Langi, a patient ${ln} tutor for a ${level} learner. Answer the question clearly in English ` +
        `with short ${ln} examples. Be concise.\n${shared}` +
        `Reply ONLY as JSON: {"reply":"<your answer>","corrections":"","vocab":[],"suggestions":[]}.`
      : `${convoLead}${shared}` +
        `- corrections: only when the learner WROTE ${ln} with mistakes that affect meaning or grammar, give a ` +
        `short English note; ignore minor punctuation/spacing. Leave empty otherwise.\n` +
        `- corrected: when corrections is non-empty, give the learner's sentence rewritten correctly in ${ln}. ` +
        `Empty when there's nothing to correct.\n` +
        `Reply ONLY as JSON: {"reply":"<${ln} reply, or English if it's a help-question>","corrections":"<short English note or empty>","corrected":"<corrected ${ln} sentence or empty>","vocab":[],"suggestions":["<${ln}>"]}.`

  // Only the last ~10 turns go to the model as context (keeps prompts small).
  const out = await chatJson<{ reply?: string; corrections?: string; corrected?: string; vocab?: TutorVocab[]; suggestions?: string[] }>(
    [{ role: 'system', content: system }, ...history.slice(-10)],
    { temperature: 0.7, maxTokens: 600 }
  )
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
  score: number          // 0–100 overall
  goalsMet: boolean[]    // aligned with the scenario's goals
  feedback: string       // short English summary
  phrases: { phrase: string; translation: string }[] // useful lines for next time
}

/** Grade a finished role-play: which goals the learner achieved, how well, and
 * a few phrases that would have helped. Only the learner's turns are judged. */
export async function scenarioDebrief(args: {
  history: ChatMessage[]
  scenario: string
  level: string
  lang: string
}): Promise<ScenarioDebrief | null> {
  const sc = scenarioByKey(args.scenario)
  if (!sc) return null
  const ln = langName(args.lang)
  const transcript = args.history
    .slice(-24)
    .map((m) => `${m.role === 'user' ? 'LEARNER' : 'LANGI'}: ${m.content}`)
    .join('\n')
  const out = await chatJson<{ score?: number; goalsMet?: unknown[]; feedback?: string; phrases?: { phrase?: string; translation?: string }[] }>([
    {
      role: 'system',
      content:
        `You are a kind but honest ${ln} speaking examiner. A ${args.level} learner just did a role-play: ` +
        `${sc.setting} Their goals were:\n${sc.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}\n` +
        `Judge ONLY the LEARNER's lines. A goal counts as met if the learner did it themselves in understandable ${ln} ` +
        `(small errors are fine). Score 0–100 for how well they handled the situation at their level. ` +
        `Give 1–2 sentences of English feedback, and 2–3 short ${ln} phrases that would have helped, with English translations. ` +
        `Reply ONLY as JSON: {"score":0,"goalsMet":[true,false,…],"feedback":"…","phrases":[{"phrase":"…","translation":"…"}]}.`,
    },
    { role: 'user', content: transcript },
  ], { temperature: 0.3, maxTokens: 400 })
  if (!out) return null
  let score = Number(out.score)
  if (!Number.isFinite(score)) score = 0
  const raw = Array.isArray(out.goalsMet) ? out.goalsMet : []
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    goalsMet: sc.goals.map((_, i) => raw[i] === true || raw[i] === 'true'),
    feedback: String(out.feedback || '').trim(),
    phrases: (Array.isArray(out.phrases) ? out.phrases : [])
      .map((p) => ({ phrase: String(p?.phrase || '').trim(), translation: String(p?.translation || '').trim() }))
      .filter((p) => p.phrase)
      .slice(0, 3),
  }
}

// --- Sentence construction -------------------------------------------------

/** An English sentence for the learner to translate into the target language. */
export async function generateSentencePrompt(level: string, lang: string, focus?: string[]): Promise<string> {
  const ln = langName(lang)
  const out = await chatJson<{ prompt?: string }>([
    {
      role: 'system',
      content:
        `You are a ${ln} writing coach. Produce ONE short, natural English sentence for a ${level} learner ` +
        `to translate into ${ln}. Match their level (simpler for A1/A2, richer for B1+). Vary the topic. ` +
        focusClause(focus, 'About half the time, write a sentence whose translation needs one of those forms, so they re-practise it.') +
        `Reply ONLY as JSON: {"prompt":"<English sentence>"}.`,
    },
    { role: 'user', content: `Give me a level-${level} sentence to translate.` },
  ], { temperature: 1.0, maxTokens: 120 })
  return String(out?.prompt || '').trim()
}

export interface SentenceGrade { score: number; feedback: string; correction: string }

/** Grade a learner's translation of `promptEnglish` into the target language. */
export async function gradeSentence(promptEnglish: string, sentence: string, level: string, lang: string): Promise<SentenceGrade> {
  const ln = langName(lang)
  const out = await chatJson<{ score?: number; feedback?: string; correction?: string }>([
    {
      role: 'system',
      content:
        `You are a supportive ${ln} writing examiner. The student translated an English sentence into ${ln}. ` +
        `Judge accuracy, grammar and naturalness for a ${level} learner. Be encouraging but precise. ` +
        `Return JSON: {"score": <integer 0-100>, "feedback":"<short English feedback>", ` +
        `"correction":"<one correct, natural ${ln} translation>"}.`,
    },
    { role: 'user', content: `English: "${promptEnglish}"\nStudent's ${ln}: "${sentence}"` },
  ], { temperature: 0.3, maxTokens: 300 })
  let score = Number(out?.score)
  if (!Number.isFinite(score)) score = 0
  score = Math.max(0, Math.min(100, Math.round(score)))
  return {
    score,
    feedback: String(out?.feedback || '').trim(),
    correction: String(out?.correction || '').trim(),
  }
}
