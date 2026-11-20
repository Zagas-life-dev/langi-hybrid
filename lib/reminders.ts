import { connectDB } from '@/lib/db'
import LangiUser from '@/lib/models/LangiUser'
import PushSubscription from '@/lib/models/PushSubscription'
import Mistake from '@/lib/models/Mistake'
import { boxDistribution } from '@/lib/srs'
import { notifyUser } from '@/lib/notify'
import { langMeta } from '@/lib/langs'
import DailyActivity from '@/lib/models/DailyActivity'
import { weekDateKeys, summarizeWeek, digestMessage } from '@/lib/weekly'

// Don't nudge twice inside this window (guards against an hourly scheduler that
// fires more than once within the learner's reminder hour).
const DEDUPE_MS = 20 * 60 * 60 * 1000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Wall-clock hour + 'YYYY-MM-DD' for an instant in a learner's timezone, given
// their getTimezoneOffset() (minutes; local = UTC − offset). We read the shifted
// instant in UTC so the server's own TZ never leaks in.
function localParts(instant: Date, offsetMin: number): { hour: number; key: string; weekday: number } {
  const d = new Date(instant.getTime() - offsetMin * 60000)
  return {
    hour: d.getUTCHours(),
    key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    weekday: d.getUTCDay(), // 0 = Sunday
  }
}

// Weekly digest: Sunday, at the learner's reminder hour, at most once per ~week.
const DIGEST_DEDUPE_MS = 6 * 24 * 60 * 60 * 1000

async function sendWeeklyDigest(userId: string, now: Date): Promise<void> {
  const [thisWeek, lastWeek] = [weekDateKeys(now), weekDateKeys(now, 1)]
  const rows = await DailyActivity.find({ userId, date: { $in: [...thisWeek, ...lastWeek] } }).lean()
  const week = summarizeWeek(rows.filter((r) => thisWeek.includes(r.date)))
  const prev = summarizeWeek(rows.filter((r) => lastWeek.includes(r.date)))
  const { title, body } = digestMessage(week, prev)
  await notifyUser({ userId: String(userId), type: 'weekly_digest', title, body, url: '/progress' }).catch(() => {})
  await LangiUser.updateOne({ _id: userId }, { $set: { lastDigestAt: now } })
}

export interface ReminderResult {
  considered: number
  sent: number
  digests: number
  details: { userId: string; due: number; reason: string }[]
}

/**
 * Send a study reminder to every learner whose local clock has reached their
 * chosen reminder hour, who hasn't studied yet today, and who has a subscribed
 * device. Idempotent within ~a day via lastReminderAt. Meant to be hit hourly by
 * any external scheduler (Windows Task Scheduler, cron, hosting cron).
 */
export async function runReminderSweep({ dry = false }: { dry?: boolean } = {}): Promise<ReminderResult> {
  await connectDB()
  const now = new Date()

  const users = await LangiUser.find({ pushReminders: true }).lean()
  const userIds = users.map((u) => String(u._id))
  if (userIds.length === 0) return { considered: 0, sent: 0, digests: 0, details: [] }

  // Latest device offset per user (a user may have several devices/browsers).
  const subs = await PushSubscription.find({ userId: { $in: userIds } }).sort({ updatedAt: -1 }).lean()
  const offsetByUser = new Map<string, number>()
  for (const s of subs) if (!offsetByUser.has(s.userId)) offsetByUser.set(s.userId, s.tzOffsetMinutes || 0)

  const details: ReminderResult['details'] = []
  let considered = 0
  let sent = 0
  let digests = 0

  for (const u of users) {
    const uid = String(u._id)
    if (!offsetByUser.has(uid)) continue // no subscribed device — can't push
    const offset = offsetByUser.get(uid)!

    const localNow = localParts(now, offset)
    if (localNow.hour !== (u.reminderHour ?? 19)) continue
    considered++

    // Sunday digest goes out whether or not they studied today.
    const digestDue = localNow.weekday === 0 &&
      (!u.lastDigestAt || now.getTime() - new Date(u.lastDigestAt).getTime() > DIGEST_DEDUPE_MS)
    if (digestDue) {
      if (!dry) await sendWeeklyDigest(u._id, now)
      digests++
    }

    // Already studied today (in their local frame)?
    if (u.lastStudyDate && localParts(new Date(u.lastStudyDate), offset).key === localNow.key) continue
    // Already nudged recently?
    if (u.lastReminderAt && now.getTime() - new Date(u.lastReminderAt).getTime() < DEDUPE_MS) continue

    const lang = u.learningLang || 'fr'
    const [dist, mistakesDue] = await Promise.all([
      boxDistribution(uid, lang),
      Mistake.countDocuments({ userId: u._id, resolved: false, dueAt: { $lte: now } }),
    ])
    const due = (dist.dueNow || 0) + mistakesDue

    const streak = u.streak || 0
    let title: string
    let body: string
    if (streak >= 2) {
      title = `Keep your ${streak}-day streak 🔥`
      body = due > 0
        ? `${due} ${due === 1 ? 'card is' : 'cards are'} waiting — a few minutes keeps it alive.`
        : `A quick session keeps your streak alive.`
    } else {
      title = `Time for ${langMeta(lang).name} ${langMeta(lang).flag}`
      body = due > 0 ? `${due} ${due === 1 ? 'card is' : 'cards are'} due. Let's learn!` : `A few minutes today builds the habit.`
    }

    details.push({ userId: uid, due, reason: streak >= 2 ? 'streak' : 'habit' })

    if (!dry) {
      await notifyUser({
        userId: u._id,
        type: streak >= 2 ? 'streak_warning' : 'study_reminder',
        title,
        body,
        url: '/learn',
      }).catch(() => {})
      await LangiUser.updateOne({ _id: u._id }, { $set: { lastReminderAt: now } })
    }
    sent++
  }

  return { considered, sent, digests, details }
}
