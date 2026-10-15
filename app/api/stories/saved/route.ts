import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Story, { type IStory } from '@/lib/models/Story'
import StorySave from '@/lib/models/StorySave'

// Stories the learner has bookmarked (their own or others'), newest-saved first.
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await connectDB()
  const saves = await StorySave.find({ userId: dbUser._id }).sort({ createdAt: -1 }).limit(50).lean()
  const ids = saves.map((s) => s.storyId)
  const stories = await Story.find({ _id: { $in: ids } })
    .select('title titleTranslation level topic genre authorName likeCount published hidden userId sentences')
    .lean<IStory[]>()
  const byId = new Map(stories.map((s) => [String(s._id), s]))

  // Preserve save order; drop any that became inaccessible (unpublished by
  // someone else / hidden), but keep the learner's own saved stories.
  const out = saves
    .map((sv) => byId.get(String(sv.storyId)))
    .filter((s): s is IStory => {
      if (!s) return false
      const own = String(s.userId) === String(dbUser._id)
      return own || (s.published && !s.hidden)
    })
    .map((s) => ({
      id: String(s._id),
      title: s.title,
      titleTranslation: s.titleTranslation,
      level: s.level,
      topic: s.topic,
      genre: s.genre || '',
      author: s.authorName || '',
      likes: s.likeCount || 0,
      length: s.sentences?.length || 0,
    }))

  return NextResponse.json({ stories: out })
}
