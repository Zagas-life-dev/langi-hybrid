import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import GrammarProgress from '@/lib/models/GrammarProgress'
import { grammarTopic } from '@/lib/grammar'
import { recordActivity } from '@/lib/activity'
import { recordMistake } from '@/lib/mistakes'

interface MissedDrill { prompt?: string; answer?: string; hint?: string }

// Record completion of a grammar lesson's drill set: save best score, file any
// missed drills into the Mistakes deck, and count the practice toward the goal.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string
    total?: number
    correct?: number
    missed?: MissedDrill[]
  }
  const topic = body.slug ? grammarTopic(body.slug) : undefined
  if (!topic) return NextResponse.json({ error: 'Unknown lesson' }, { status: 400 })

  // Clamp untrusted client counts so practice can't inflate the daily goal.
  const total = Math.max(0, Math.min(20, Math.round(body.total ?? 0)))
  const correct = Math.max(0, Math.min(total, Math.round(body.correct ?? 0)))
  const score = total > 0 ? Math.round((correct / total) * 100) : 0
  const lang = dbUser.learningLang

  await connectDB()
  await GrammarProgress.findOneAndUpdate(
    { userId: dbUser._id, lessonSlug: topic.slug },
    {
      $set: { completed: true, lastAttemptAt: new Date(), languageCode: lang },
      $max: { bestScore: score },
      $inc: { attempts: 1 },
      $setOnInsert: { userId: dbUser._id, lessonSlug: topic.slug },
    },
    { upsert: true }
  )

  // Missed drills become re-practisable Mistakes-deck items.
  for (const d of (body.missed || []).slice(0, 20)) {
    if (d?.prompt && d?.answer) {
      await recordMistake(dbUser._id, lang, {
        source: 'grammar',
        prompt: `${topic.title}: ${d.prompt}`,
        answer: d.answer,
        note: d.hint || '',
      })
    }
  }

  const activity = total > 0
    ? await recordActivity(dbUser, { kind: 'grammar', count: total, xp: correct * 3 })
    : { streak: dbUser.streak || 0, newlyMetGoal: false, unlocked: [] }

  return NextResponse.json({
    ok: true,
    score,
    streak: activity.streak,
    newlyMetGoal: activity.newlyMetGoal,
    unlocked: activity.unlocked,
  })
}
