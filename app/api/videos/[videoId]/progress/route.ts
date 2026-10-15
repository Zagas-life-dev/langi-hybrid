import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import WatchHistory from '@/lib/models/WatchHistory'

// POST {position, duration} — remember where the learner is in this video so the
// watch page can resume there. Sent periodically while playing and via
// sendBeacon when the page is closed. Near the end counts as finished, so the
// resume point resets and a rewatch starts from the beginning.
export async function POST(req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  const body = (await req.json().catch(() => ({}))) as { position?: unknown; duration?: unknown }
  const duration = Number(body.duration)
  let position = Number(body.position)
  if (!Number.isFinite(position) || position < 0 || !Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: 'Bad position' }, { status: 400 })
  }
  position = Math.min(Math.floor(position), Math.floor(duration))
  if (position / duration >= 0.95) position = 0

  await connectDB()
  // Only update an existing row — opening the page (WatchTracker) creates it.
  await WatchHistory.updateOne(
    { userId: dbUser._id, videoId },
    { $set: { position, duration: Math.floor(duration) } },
  )
  return NextResponse.json({ ok: true })
}
