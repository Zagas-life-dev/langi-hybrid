// Pure story shapes and cleaning (no browser or Firebase imports), shared by the browser generator
// and the server route that stores the result, so both bound a story the same way.

export interface GeneratedStory {
  title: string
  titleTranslation: string
  sentences: { text: string; translation: string }[]
  glossary: { term: string; translation: string }[]
  questions: { question: string; options: string[]; answer: number }[]
}

/** Trim and bound a generated story so a rambling model can't produce an unusable one. */
export function cleanStory(out: Partial<GeneratedStory>): GeneratedStory | null {
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
