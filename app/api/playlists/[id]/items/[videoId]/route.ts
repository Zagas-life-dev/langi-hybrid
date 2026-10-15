import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Playlist from '@/lib/models/Playlist'

// DELETE — remove a video from the playlist (owner only) and re-pack order.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, videoId } = await params
  await connectDB()
  const p = await Playlist.findById(id)
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (String(p.ownerId) !== String(dbUser._id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  p.items = p.items
    .filter((it) => it.videoId !== videoId)
    .sort((a, b) => a.order - b.order)
    .map((it, i) => ({ ...it, order: i }))
  await p.save()
  return NextResponse.json({ ok: true, count: p.items.length })
}
