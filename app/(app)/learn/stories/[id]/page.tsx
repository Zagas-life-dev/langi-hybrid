import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Story, { type IStory } from '@/lib/models/Story'
import StoryLike from '@/lib/models/StoryLike'
import StorySave from '@/lib/models/StorySave'
import StoryReader, { type StoryData } from '@/components/StoryReader'
import StorySocialBar from '@/components/StorySocialBar'

export const dynamic = 'force-dynamic'

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { dbUser } = await requireUser()
  await connectDB()
  let doc: IStory | null = null
  try {
    doc = await Story.findById(id).lean<IStory | null>()
  } catch {
    notFound()
  }
  if (!doc) notFound()

  // Access: your own story, or one published to the community and not hidden.
  const isOwner = String(doc.userId) === String(dbUser._id)
  if (!isOwner && !(doc.published && !doc.hidden)) notFound()

  const [liked, saved] = await Promise.all([
    StoryLike.exists({ storyId: doc._id, userId: dbUser._id }),
    StorySave.exists({ storyId: doc._id, userId: dbUser._id }),
  ])

  const story: StoryData = {
    title: doc.title,
    titleTranslation: doc.titleTranslation,
    level: doc.level,
    sentences: doc.sentences.map((s) => ({ text: s.text, translation: s.translation })),
    glossary: doc.glossary.map((g) => ({ term: g.term, translation: g.translation })),
    questions: doc.questions.map((q) => ({ question: q.question, options: q.options, answer: q.answer })),
  }
  return (
    <StoryReader
      story={story}
      storyRef={String(doc._id)}
      socialBar={
        <StorySocialBar
          storyId={String(doc._id)}
          isOwner={isOwner}
          initialPublished={doc.published}
          initialLiked={Boolean(liked)}
          initialLikes={doc.likeCount || 0}
          initialSaved={Boolean(saved)}
        />
      }
    />
  )
}
