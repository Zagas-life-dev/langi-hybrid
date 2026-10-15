import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import VideoComment from '@/lib/models/VideoComment'

const MAX_LEN = 1000
const PAGE_SIZE = 50

// GET → newest-first comments for the video.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  await connectDB()
  const comments = await VideoComment.find({ videoId })
    .sort({ createdAt: -1 })
    .limit(PAGE_SIZE)
    .lean()
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: String(c._id),
      displayName: c.displayName,
      text: c.text,
      createdAt: c.createdAt,
    })),
  })
}

// POST {text} → add a comment, return the created row.
export async function POST(req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  const body = await req.json().catch(() => ({}))
  const text = String((body as { text?: string }).text || '').trim()
  if (!text) return NextResponse.json({ error: 'Comment is empty' }, { status: 400 })
  if (text.length > MAX_LEN) return NextResponse.json({ error: 'Comment too long' }, { status: 400 })

  await connectDB()
  const created = await VideoComment.create({
    videoId,
    languageCode: dbUser.learningLang,
    userId: dbUser._id,
    displayName: dbUser.displayName || dbUser.email?.split('@')[0] || 'Learner',
    text,
  })
  return NextResponse.json({
    comment: {
      id: String(created._id),
      displayName: created.displayName,
      text: created.text,
      createdAt: created.createdAt,
    },
  })
}
