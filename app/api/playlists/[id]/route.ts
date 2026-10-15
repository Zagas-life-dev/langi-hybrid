import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Playlist from '@/lib/models/Playlist'
import { isAdmin } from '@/lib/admin'

// GET — full playlist (owner sees private; others only if public/official).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let dbUser, supabaseUser
  try {
    ({ dbUser, supabaseUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await connectDB()
  const p = await Playlist.findById(id).lean()
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const owner = String(p.ownerId) === String(dbUser._id)
  if (!owner && !p.isPublic && !p.isOfficial && !isAdmin(supabaseUser.email)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({
    id: String(p._id),
    title: p.title,
    description: p.description,
    ownerName: p.ownerName,
    isOwner: owner,
    isCourse: p.isCourse,
    isPublic: p.isPublic,
    isOfficial: p.isOfficial,
    level: p.level,
    items: [...p.items].sort((a, b) => a.order - b.order),
  })
}

// PATCH — edit metadata. Owner may change title/description/public/course/level.
// Only an admin may set isOfficial.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let dbUser, supabaseUser
  try {
    ({ dbUser, supabaseUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await connectDB()
  const p = await Playlist.findById(id)
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const owner = String(p.ownerId) === String(dbUser._id)
  const admin = isAdmin(supabaseUser.email)
  if (!owner && !admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  if (owner) {
    if (typeof body.title === 'string' && body.title.trim()) p.title = body.title.trim().slice(0, 120)
    if (typeof body.description === 'string') p.description = body.description.slice(0, 500)
    if (typeof body.isPublic === 'boolean') p.isPublic = body.isPublic
    if (typeof body.isCourse === 'boolean') p.isCourse = body.isCourse
    if (typeof body.level === 'string' || body.level === null) p.level = body.level as never
    if (Array.isArray(body.order)) {
      // Reorder by an array of videoIds.
      const order = body.order as string[]
      p.items.forEach((it) => {
        const idx = order.indexOf(it.videoId)
        if (idx !== -1) it.order = idx
      })
    }
  }
  if (admin && typeof body.isOfficial === 'boolean') p.isOfficial = body.isOfficial
  await p.save()
  return NextResponse.json({ ok: true })
}

// DELETE — owner or admin.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let dbUser, supabaseUser
  try {
    ({ dbUser, supabaseUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await connectDB()
  const p = await Playlist.findById(id)
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (String(p.ownerId) !== String(dbUser._id) && !isAdmin(supabaseUser.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await p.deleteOne()
  return NextResponse.json({ ok: true })
}
