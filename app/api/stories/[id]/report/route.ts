import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Story from '@/lib/models/Story'
import StoryReport, { REPORT_HIDE_THRESHOLD } from '@/lib/models/StoryReport'

// Report a published story. One report per user (unique index). When the count
// crosses the threshold the story is auto-hidden from the feed (report-only
// moderation). The owner can't report their own story.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { reason?: string }
  const reason = (body.reason || '').toString().trim().slice(0, 300)

  await connectDB()
  const story = await Story.findById(id).select('userId published hidden reportCount')
  if (!story) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (String(story.userId) === String(dbUser._id)) {
    return NextResponse.json({ error: 'You can\'t report your own story.' }, { status: 400 })
  }

  try {
    await StoryReport.create({ storyId: story._id, userId: dbUser._id, reason })
  } catch (e) {
    // Duplicate (E11000) → already reported by this user; treat as success.
    if ((e as { code?: number }).code === 11000) {
      return NextResponse.json({ reported: true, already: true })
    }
    throw e
  }

  const updated = await Story.findByIdAndUpdate(
    story._id,
    { $inc: { reportCount: 1 } },
    { new: true, projection: 'reportCount' }
  )
  if (updated && updated.reportCount >= REPORT_HIDE_THRESHOLD) {
    await Story.updateOne({ _id: story._id }, { $set: { hidden: true } })
  }
  return NextResponse.json({ reported: true })
}
