import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import VideoLike from '@/lib/models/VideoLike'

// GET → current like count + whether this user has liked the video.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  await connectDB()
  const [count, mine] = await Promise.all([
    VideoLike.countDocuments({ videoId }),
    VideoLike.exists({ videoId, userId: dbUser._id }),
  ])
  return NextResponse.json({ count, liked: Boolean(mine) })
}

// POST → toggle this user's like, return the new count + state.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  await connectDB()

  const existing = await VideoLike.findOne({ videoId, userId: dbUser._id })
  let liked: boolean
  if (existing) {
    await existing.deleteOne()
    liked = false
  } else {
    await VideoLike.create({ videoId, userId: dbUser._id, languageCode: dbUser.learningLang })
    liked = true
  }
  const count = await VideoLike.countDocuments({ videoId })
  return NextResponse.json({ count, liked })
}
