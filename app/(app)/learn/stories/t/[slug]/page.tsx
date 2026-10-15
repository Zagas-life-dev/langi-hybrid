import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import StoryTemplate, { type IStoryTemplate } from '@/lib/models/StoryTemplate'
import StoryReader, { type StoryData } from '@/components/StoryReader'
import { isReadingUnlocked } from '@/lib/levels'

export const dynamic = 'force-dynamic'

// Reader for a CURATED dataset story (vs. /learn/stories/[id], the AI library).
export default async function StoryTemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { dbUser } = await requireUser()
  await connectDB()
  const doc = await StoryTemplate.findOne({ slug, languageCode: dbUser.learningLang }).lean<IStoryTemplate | null>()
  if (!doc) notFound()
  // Enforce the level gate server-side so a locked story can't be deep-linked.
  if (!isReadingUnlocked(doc.level, dbUser.cefrLevel)) redirect('/learn/stories')

  const story: StoryData = {
    title: doc.title,
    titleTranslation: doc.titleTranslation,
    level: doc.level,
    sentences: doc.sentences.map((s) => ({ text: s.text, translation: s.translation })),
    glossary: doc.glossary.map((g) => ({ term: g.term, translation: g.translation })),
    questions: doc.questions.map((q) => ({ question: q.question, options: q.options, answer: q.answer })),
  }
  return <StoryReader story={story} storyRef={`t/${slug}`} />
}
