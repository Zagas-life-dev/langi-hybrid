import { chatJson, langName } from '@/lib/ai'
import { langName as nativeName } from '@/lib/langs'
import { genreByKey, genrePromptHint, maturityHint } from '@/lib/genres'
import type { CefrLevel } from '@/lib/models/LangiUser'

// AI graded-reader generator. Produces a short, CEFR-graded story in the target
// language with per-sentence translations, a glossary and comprehension MCQs —
// the reading-comprehension layer (LingQ-style) the app was missing. The same
// content powers read-aloud (TTS) and per-sentence pronunciation practice.

export interface GeneratedStory {
  title: string
  titleTranslation: string
  sentences: { text: string; translation: string }[]
  glossary: { term: string; translation: string }[]
  questions: { question: string; options: string[]; answer: number }[]
}

// Length + richness scale with level so A1 isn't a wall of text and C2 isn't trivial.
function shape(level: CefrLevel): { sentences: string; note: string } {
  switch (level) {
    case 'A1': return { sentences: '6–8 very short, simple sentences (present tense, high-frequency words)', note: 'Keep vocabulary tiny and concrete.' }
    case 'A2': return { sentences: '8–10 short sentences (present + passé composé, everyday vocabulary)', note: 'Simple connected narrative.' }
    case 'B1': return { sentences: '10–12 sentences with some variety of tenses and connectors', note: 'A clear beginning, middle and end.' }
    case 'B2': return { sentences: '12–14 sentences with richer vocabulary, subordinate clauses and some idiom', note: 'Some nuance and opinion.' }
    case 'C1': return { sentences: '12–16 sentences with sophisticated vocabulary, varied register and subtlety', note: 'Allow figurative language and complex syntax.' }
    case 'C2': return { sentences: '14–18 sentences with near-native sophistication, idiom and stylistic flair', note: 'Literary, precise, idiomatic.' }
  }
}

export async function generateStory(args: {
  level: CefrLevel
  lang: string
  topic?: string
  nativeLang?: string
  genre?: string
  premise?: string
  mature?: boolean
}): Promise<GeneratedStory | null> {
  const { level, lang, topic, nativeLang = 'en', genre, premise, mature = false } = args
  const ln = langName(lang)
  const nn = nativeName(nativeLang)
  const s = shape(level)
  const g = genreByKey(genre)
  // Genre scaffold gives the model tropes/setting/premise so plots have depth.
  // The maturity guardrail is always present (genre-specific or standalone).
  const styleLine = g ? ` ${genrePromptHint(g, premise, mature)}` : ` ${maturityHint(mature)}`
  const userAsk = topic
    ? `Write the story about: ${topic}.${g ? ` In the ${g.label} genre.` : ''}`
    : g
      ? `Write a ${g.label} story.`
      : `Write a story on any everyday theme.`
  const out = await chatJson<GeneratedStory>([
    {
      role: 'system',
      content:
        `You are an expert ${ln} teacher who writes engaging graded readers. Write an ORIGINAL ${ln} story for a ` +
        `CEFR ${level} learner: ${s.sentences}. ${s.note}${styleLine} Then give a faithful ${nn} translation of EACH ` +
        `sentence, a short glossary of the trickiest words, and comprehension questions. ` +
        `Return ONLY JSON: {` +
        `"title":"<${ln} title>",` +
        `"titleTranslation":"<${nn} title>",` +
        `"sentences":[{"text":"<one ${ln} sentence>","translation":"<${nn}>"}],` +
        `"glossary":[{"term":"<${ln} word/phrase from the story>","translation":"<${nn}>"}],  // 5–8 items` +
        `"questions":[{"question":"<${nn} comprehension question>","options":["<${nn}>","<${nn}>","<${nn}>","<${nn}>"],"answer":<index 0-3 of the correct option>}]  // 3 questions` +
        `}. Use natural ${ln} with correct accents. Each sentence must be a single sentence.`,
    },
    { role: 'user', content: userAsk },
  ], { temperature: 0.95, maxTokens: 2000 })

  if (!out) return null
  const sentences = (Array.isArray(out.sentences) ? out.sentences : [])
    .map((x) => ({ text: String(x?.text || '').trim(), translation: String(x?.translation || '').trim() }))
    .filter((x) => x.text)
    .slice(0, 20)
  if (sentences.length < 3) return null
  const glossary = (Array.isArray(out.glossary) ? out.glossary : [])
    .map((g) => ({ term: String(g?.term || '').trim(), translation: String(g?.translation || '').trim() }))
    .filter((g) => g.term && g.translation)
    .slice(0, 10)
  const questions = (Array.isArray(out.questions) ? out.questions : [])
    .map((q) => ({
      question: String(q?.question || '').trim(),
      options: (Array.isArray(q?.options) ? q.options : []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4),
      answer: Number(q?.answer) || 0,
    }))
    .filter((q) => q.question && q.options.length >= 2)
    .map((q) => ({ ...q, answer: Math.max(0, Math.min(q.options.length - 1, q.answer)) }))
    .slice(0, 5)
  return {
    title: String(out.title || '').trim() || 'Story',
    titleTranslation: String(out.titleTranslation || '').trim(),
    sentences,
    glossary,
    questions,
  }
}
