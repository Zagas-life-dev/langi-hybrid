import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import PushSubscription from '@/lib/models/PushSubscription'

// Store (or refresh) a browser push subscription for the current learner.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const sub = body?.subscription ?? body
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  await connectDB()
  await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    {
      userId: String(dbUser._id),
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      userAgent: req.headers.get('user-agent'),
      tzOffsetMinutes: typeof body?.tzOffsetMinutes === 'number' ? body.tzOffsetMinutes : 0,
    },
    { upsert: true, returnDocument: 'after' }
  )
  return NextResponse.json({ ok: true })
}
