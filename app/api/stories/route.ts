import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Story from '@/lib/models/Story'
import StoryTemplate from '@/lib/models/StoryTemplate'
import { checkLimit } from '@/lib/ratelimit'
import { generateStory } from '@/lib/stories'
import { surpriseSeed } from '@/lib/genres'
import { CEFR_LEVELS, type CefrLevel } from '@/lib/models/LangiUser'
import { readingUnlocked } from '@/lib/levels'
import { isAdult } from '@/lib/age'

// GET: curated suggestions (by level) + the learner's AI-generated library.
// POST: generate a new AI story (the fallback when no curated story fits).
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

  const limit = await checkLimit(String(dbUser._id))
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit reached. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } })
  }

  const body = (await req.json().catch(() => ({}))) as { topic?: string; genre?: string; surprise?: boolean }
  let topic = (body.topic || '').toString().trim().slice(0, 120)
  const level = (dbUser.cefrLevel || 'A2') as CefrLevel

  // "Surprise me" (true surprise): ignore inputs, roll a random genre + premise.
  let genre = (body.genre || '').toString().trim().slice(0, 40)
  let premise: string | undefined
  if (body.surprise) {
    const seed = surpriseSeed()
    genre = seed.genre.key
    premise = seed.premise
    topic = ''
  }

  // Mature treatment is decided server-side: adult AND opted in. Never trust the client.
  const mature = isAdult(dbUser.birthdate) && Boolean(dbUser.matureContent)

  try {
    const gen = await generateStory({ level, lang: dbUser.learningLang, topic, nativeLang: dbUser.nativeLang, genre, premise, mature })
    if (!gen) return NextResponse.json({ error: 'Could not generate a story. Try again.' }, { status: 502 })
    await connectDB()
    const doc = await Story.create({
      userId: dbUser._id,
      languageCode: dbUser.learningLang,
      level,
      topic,
      genre,
      ...gen,
    })
    return NextResponse.json({ id: String(doc._id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI unavailable' }, { status: 503 })
  }
}
