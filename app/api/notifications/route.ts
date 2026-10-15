import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Notification from '@/lib/models/Notification'

// Recent notifications + unread count for the bell (polled).
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()
  const [notifications, unread] = await Promise.all([
    Notification.find({ userId: dbUser._id }).sort({ createdAt: -1 }).limit(20).lean(),
    Notification.countDocuments({ userId: dbUser._id, read: false }),
  ])

  return NextResponse.json({
    unread,
    notifications: notifications.map((n) => ({
      _id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      url: n.url,
      read: n.read,
      createdAt: n.createdAt,
    })),
  })
}
