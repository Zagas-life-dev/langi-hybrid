import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Story from '@/lib/models/Story'
import StoryTemplate from '@/lib/models/StoryTemplate'
import { cleanStory } from '@/lib/hybrid/storyCore'
import { isAdult } from '@/lib/age'
import { CEFR_LEVELS, type CefrLevel } from '@/lib/models/LangiUser'
import { readingUnlocked } from '@/lib/levels'

// GET: curated suggestions (by level) + the learner's AI-generated library.
// POST: save a story the browser generated through Firebase AI Logic (the fallback when no curated story fits).
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await connectDB()

  const [library, templates] = await Promise.all([
    Story.find({ userId: dbUser._id, languageCode: dbUser.learningLang })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('title titleTranslation level topic genre createdAt sentences')
      .lean(),
    StoryTemplate.find({ languageCode: dbUser.learningLang })
      .select('slug title titleTranslation level topic sentences order')
      .lean(),
  ])

  // Order curated stories by proximity to the learner's level (their level
  // first, then easier, then harder) so the top suggestions always fit.
  const userIdx = dbUser.cefrLevel ? CEFR_LEVELS.indexOf(dbUser.cefrLevel) : 0
  const suggested = templates
    .map((t) => ({
      slug: t.slug,
      title: t.title,
      titleTranslation: t.titleTranslation,
      level: t.level,
      topic: t.topic,
      length: t.sentences?.length || 0,
      _d: Math.abs(CEFR_LEVELS.indexOf(t.level as CefrLevel) - userIdx),
      _h: CEFR_LEVELS.indexOf(t.level as CefrLevel) > userIdx ? 1 : 0,
    }))
    .sort((a, b) => a._d - b._d || a._h - b._h || a.title.localeCompare(b.title))
    .map(({ _d, _h, ...rest }) => { void _d; void _h; return rest })

  return NextResponse.json({
    level: dbUser.cefrLevel || null,
    unlocked: readingUnlocked(dbUser.cefrLevel),
    // Effective mature flag (adult AND opted in) so the UI can warn before generating.
    mature: isAdult(dbUser.birthdate) && Boolean(dbUser.matureContent),
    suggested,
    stories: library.map((s) => ({
      id: String(s._id),
      title: s.title,
      titleTranslation: s.titleTranslation,
      level: s.level,
      topic: s.topic,
      genre: s.genre || '',
      length: s.sentences?.length || 0,
      createdAt: s.createdAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { story?: unknown; topic?: string; genre?: string }
  const story = cleanStory((body.story ?? {}) as Parameters<typeof cleanStory>[0])
  if (!story) return NextResponse.json({ error: 'That story was too short to save. Try again.' }, { status: 400 })
  const level = (dbUser.cefrLevel || 'A2') as CefrLevel

  await connectDB()
  const doc = await Story.create({
    userId: dbUser._id,
    languageCode: dbUser.learningLang,
    level,
    topic: (body.topic || '').toString().trim().slice(0, 120),
    genre: (body.genre || '').toString().trim().slice(0, 40),
    ...story,
  })
  return NextResponse.json({ id: String(doc._id) })
}
