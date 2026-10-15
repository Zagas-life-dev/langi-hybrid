import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Notification from '@/lib/models/Notification'

// Mark notifications read: { ids: [...] } for specific ones, or {} for all.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] }
  await connectDB()
  const filter = Array.isArray(ids) && ids.length > 0
    ? { userId: dbUser._id, _id: { $in: ids } }
    : { userId: dbUser._id, read: false }
  await Notification.updateMany(filter, { $set: { read: true } })
  return NextResponse.json({ ok: true })
}
