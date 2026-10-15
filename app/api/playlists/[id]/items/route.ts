import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Playlist from '@/lib/models/Playlist'
import { getVideoMeta } from '@/lib/youtube'
import { upsertVideoDoc } from '@/lib/videoIndex'

// POST {videoId, note?} — add a video to the playlist (owner only). Hydrates
// title/channel/thumbnail from the canonical index / YouTube.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const videoId = String((body as { videoId?: string }).videoId || '').trim()
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

  await connectDB()
  const p = await Playlist.findById(id)
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (String(p.ownerId) !== String(dbUser._id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (p.items.some((it) => it.videoId === videoId)) {
    return NextResponse.json({ ok: true, alreadyAdded: true })
  }

  const meta = await getVideoMeta(videoId, p.languageCode)
  if (meta) await upsertVideoDoc(meta, p.languageCode)
  p.items.push({
    videoId,
    title: meta?.title || '',
    channelTitle: meta?.channelTitle || '',
    thumbnail: meta?.thumbnail || '',
    order: p.items.length,
    note: String((body as { note?: string }).note || '').slice(0, 200) || undefined,
  })
  await p.save()
  return NextResponse.json({ ok: true, count: p.items.length })
}
