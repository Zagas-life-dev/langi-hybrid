import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import PushSubscription from '@/lib/models/PushSubscription'

// Remove a browser push subscription (learner turned reminders off).
export async function POST(req: NextRequest) {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { endpoint } = await req.json().catch(() => ({}))
  if (endpoint) {
    await connectDB()
    await PushSubscription.deleteOne({ endpoint })
  }
  return NextResponse.json({ ok: true })
}
