import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Story from '@/lib/models/Story'

// The community feed: published, non-hidden stories in the learner's language,
// ranked by popularity (likes) then recency. Free for everyone to read.
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await connectDB()
  const stories = await Story.find({ languageCode: dbUser.learningLang, published: true, hidden: false })
    .sort({ likeCount: -1, publishedAt: -1 })
    .limit(50)
    .select('title titleTranslation level topic genre authorName likeCount saveCount publishedAt sentences')
    .lean()

  return NextResponse.json({
    stories: stories.map((s) => ({
      id: String(s._id),
      title: s.title,
      titleTranslation: s.titleTranslation,
      level: s.level,
      topic: s.topic,
      genre: s.genre || '',
      author: s.authorName || 'A learner',
      likes: s.likeCount || 0,
      saves: s.saveCount || 0,
      length: s.sentences?.length || 0,
    })),
  })
}
