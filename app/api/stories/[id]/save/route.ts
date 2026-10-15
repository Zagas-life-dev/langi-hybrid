import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Story from '@/lib/models/Story'
import StorySave from '@/lib/models/StorySave'

// Toggle the viewer's bookmark on a story they can access.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await connectDB()
  const story = await Story.findById(id).select('userId published hidden')
  if (!story) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const isOwner = String(story.userId) === String(dbUser._id)
  if (!isOwner && !(story.published && !story.hidden)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await StorySave.findOne({ storyId: story._id, userId: dbUser._id })
  let saved: boolean
  if (existing) {
    await existing.deleteOne()
    await Story.updateOne({ _id: story._id }, { $inc: { saveCount: -1 } })
    saved = false
  } else {
    await StorySave.create({ storyId: story._id, userId: dbUser._id })
    await Story.updateOne({ _id: story._id }, { $inc: { saveCount: 1 } })
    saved = true
  }
  const count = await StorySave.countDocuments({ storyId: story._id })
  return NextResponse.json({ saved, count })
}
