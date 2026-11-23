import { connectDB } from '@/lib/db'
import RateLimit from '@/lib/models/RateLimit'

// Per-user fixed-window limits protecting the external-AI routes from a bug or
// abuse draining the AI quota. Two windows: per-minute and per-day.
const PER_MIN = parseInt(process.env.AI_RATE_PER_MIN || '30', 10) || 30
const PER_DAY = parseInt(process.env.AI_RATE_PER_DAY || '300', 10) || 300
const MIN_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface LimitResult {
  ok: boolean
  retryAfter?: number // seconds
}

async function bump(userId: string, bucket: string, windowMs: number, max: number): Promise<LimitResult> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  // Two atomic steps: start a fresh window if the old one rolled over (this only matches a stale
  // window), then increment the counter, creating it on first use.
  await RateLimit.updateOne({ userId, bucket, windowStart: { $lt: windowStart } }, { $set: { windowStart, count: 0 } })
  const doc = await RateLimit.findOneAndUpdate(
    { userId, bucket },
    { $inc: { count: 1 }, $setOnInsert: { windowStart } },
    { upsert: true, returnDocument: 'after' }
  )
  if ((doc?.count ?? 1) > max) {
    return { ok: false, retryAfter: Math.ceil((windowStart + windowMs - now) / 1000) }
  }
  return { ok: true }
}

// Read-aloud burns units far faster than chat (one per sentence), so it gets a
// bigger daily allowance and its own window rather than eating the chat budget.
const TTS_PER_MIN = parseInt(process.env.TTS_RATE_PER_MIN || '60', 10) || 60
const TTS_PER_DAY = parseInt(process.env.TTS_RATE_PER_DAY || '400', 10) || 400

function limitsFor(scope: string): { perMin: number; perDay: number } {
  if (scope === 'tts') return { perMin: TTS_PER_MIN, perDay: TTS_PER_DAY }
  // Friend-code attempts: tight, so 6-char codes can't be enumerated.
  if (scope === 'friends') return { perMin: 5, perDay: 30 }
  return { perMin: PER_MIN, perDay: PER_DAY }
}

/** Check (and consume) one unit against both the minute and day windows. */
export async function checkLimit(userId: string, scope = 'ai'): Promise<LimitResult> {
  await connectDB()
  const { perMin, perDay } = limitsFor(scope)
  const day = await bump(userId, `${scope}:day`, DAY_MS, perDay)
  if (!day.ok) return day
  const min = await bump(userId, `${scope}:minute`, MIN_MS, perMin)
  return min
}
