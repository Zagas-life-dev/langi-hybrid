import { connectDB } from '@/lib/db'
import LangiUser from '@/lib/models/LangiUser'
import DailyActivity from '@/lib/models/DailyActivity'
import ReviewLog from '@/lib/models/ReviewLog'
import UserCard from '@/lib/models/UserCard'
import SentenceAttempt from '@/lib/models/SentenceAttempt'
import Mistake from '@/lib/models/Mistake'
import GrammarProgress from '@/lib/models/GrammarProgress'
import type { ILangiUser } from '@/lib/models/LangiUser'
import { notifyUser } from '@/lib/notify'
import {
  newlyUnlocked,
  type AchievementDef,
  type AchievementStats,
} from '@/lib/achievements'

const DAY_MS = 86400000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Local 'YYYY-MM-DD' key — a calendar day in the server's (≈ learner's) TZ. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's rolled-up activity for the goal ring (server components / dashboard). */
export async function getTodayActivity(userId: string, dailyGoal: number) {
  await connectDB()
  const key = localDateKey(new Date())
  const day = await DailyActivity.findOne({ userId, date: key }).lean()
  const reviews = day?.reviews || 0
  const mistakes = day?.mistakes || 0
  const grammar = day?.grammarDrills || 0
  const goalProgress = reviews + mistakes + grammar
  return {
    goalProgress,
    goal: dailyGoal,
    goalMet: goalProgress >= dailyGoal,
    reviews,
    mistakes,
    grammar,
    sentences: day?.sentences || 0,
    chats: day?.chats || 0,
    videos: day?.videos || 0,
    xp: day?.xp || 0,
  }
}

export type ActivityKind = 'review' | 'mistake' | 'grammar' | 'sentence' | 'chat' | 'video'

// Kinds that move the daily-goal ring are the SRS-style card answers:
// review + mistake + grammar (see goalProgress below).

export interface ActivityResult {
  streak: number
  goal: number
  goalProgress: number
  goalMet: boolean
  newlyMetGoal: boolean
  unlocked: { id: string; title: string; description: string; icon: string }[]
}

interface RecordOpts {
  kind: ActivityKind
  correct?: boolean
  xp?: number
  count?: number // for batch (e.g. grammar drills answered at once)
}

/**
 * Single source of truth for "the learner did something": advances the daily
 * streak + XP, rolls up today's activity counters (for the goal ring), fires the
 * goal-met nudge the first time the ring fills, and evaluates achievements.
 * Best-effort on the gamification side — never throws into the calling route.
 */
export async function recordActivity(dbUser: ILangiUser, opts: RecordOpts): Promise<ActivityResult> {
  const { kind, correct, xp = 0, count = 1 } = opts
  await connectDB()

  const now = new Date()
  const today = startOfDay(now)
  const last = dbUser.lastStudyDate ? startOfDay(new Date(dbUser.lastStudyDate)) : null

  // Streak: consecutive calendar days with any study action.
  let streak = dbUser.streak || 0
  if (last === null) streak = 1
  else if (last === today) { /* already counted today */ }
  else if (today - last === DAY_MS) streak += 1
  else streak = 1

  await LangiUser.updateOne(
    { _id: dbUser._id },
    { $set: { streak, lastStudyDate: now }, $inc: { xp } }
  )

  // Roll up today's per-kind counters.
  const inc: Record<string, number> = { xp }
  if (kind === 'review') { inc.reviews = count; if (correct) inc.correct = count }
  else if (kind === 'mistake') { inc.mistakes = count; if (correct) inc.correct = count }
  else if (kind === 'grammar') inc.grammarDrills = count
  else if (kind === 'sentence') inc.sentences = count
  else if (kind === 'chat') inc.chats = count
  else if (kind === 'video') inc.videos = count

  const dateKey = localDateKey(now)
  const day = await DailyActivity.findOneAndUpdate(
    { userId: dbUser._id, date: dateKey },
    { $inc: inc },
    { upsert: true, returnDocument: 'after' }
  )

  const goal = dbUser.dailyGoal || 20
  const goalProgress = (day?.reviews || 0) + (day?.mistakes || 0) + (day?.grammarDrills || 0)
  const goalMet = goalProgress >= goal
  let newlyMetGoal = false
  if (goalMet && day && !day.goalMet) {
    await DailyActivity.updateOne({ _id: day._id }, { $set: { goalMet: true } })
    newlyMetGoal = true
  }

  if (newlyMetGoal) {
    await notifyUser({
      userId: dbUser._id,
      type: 'goal_met',
      title: `Daily goal reached 🎯`,
      body: `${goalProgress} reviews today — nice work. ${streak}-day streak going strong.`,
      url: '/learn',
    }).catch(() => {})
  }

  const unlocked = await evaluateAchievements(dbUser, { streak, xp: (dbUser.xp || 0) + xp })

  return {
    streak,
    goal,
    goalProgress,
    goalMet,
    newlyMetGoal,
    unlocked: unlocked.map((a) => ({ id: a.id, title: a.title, description: a.description, icon: a.icon })),
  }
}

/** Check for and persist any newly-earned achievements; notify on each. */
async function evaluateAchievements(
  dbUser: ILangiUser,
  partial: { streak: number; xp: number }
): Promise<AchievementDef[]> {
  const unlockedIds = new Set((dbUser.achievements || []).map((a) => a.id))

  const [totalReviews, mastered, goalMetDays, sentences, grammarLessons, mistakesResolved] = await Promise.all([
    ReviewLog.countDocuments({ userId: dbUser._id }),
    UserCard.countDocuments({ userId: dbUser._id, box: 5 }),
    DailyActivity.countDocuments({ userId: dbUser._id, goalMet: true }),
    SentenceAttempt.countDocuments({ userId: dbUser._id }),
    GrammarProgress.countDocuments({ userId: dbUser._id, completed: true }),
    Mistake.countDocuments({ userId: dbUser._id, resolved: true }),
  ])

  const stats: AchievementStats = {
    streak: partial.streak,
    xp: partial.xp,
    totalReviews,
    mastered,
    goalMetDays,
    sentences,
    grammarLessons,
    mistakesResolved,
  }

  const fresh = newlyUnlocked(stats, unlockedIds)
  if (fresh.length === 0) return []

  await LangiUser.updateOne(
    { _id: dbUser._id },
    { $push: { achievements: { $each: fresh.map((a) => ({ id: a.id, unlockedAt: new Date() })) } } }
  )

  for (const a of fresh) {
    await notifyUser({
      userId: dbUser._id,
      type: 'achievement',
      title: `${a.icon} Achievement unlocked`,
      body: `${a.title} — ${a.description}`,
      url: '/progress',
    }).catch(() => {})
  }
  return fresh
}
