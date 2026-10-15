import { Types } from 'mongoose'
import Notification, { type LangiNotificationType } from '@/lib/models/Notification'
import { connectDB } from '@/lib/db'
import { sendPushToUser } from '@/lib/push'

interface NotifyInput {
  userId: string | Types.ObjectId
  type: LangiNotificationType
  title: string
  body?: string
  url?: string | null
  // When false, only fire a Web Push without persisting an in-app notification
  // (used for ephemeral nudges). Defaults to true.
  persist?: boolean
}

// Persist an in-app notification AND fire a Web Push. Best-effort: failures are
// logged, never thrown, so a caller in a hot path (review answer, cron sweep)
// can never be broken by a notification.
export async function notifyUser({
  userId,
  type,
  title,
  body = '',
  url = null,
  persist = true,
}: NotifyInput): Promise<void> {
  const id = String(userId)
  if (!id) return

  if (persist) {
    try {
      await connectDB()
      await Notification.create({ userId: id, type, title, body, url })
    } catch (e) {
      console.error('Failed to store notification:', e)
    }
  }

  await sendPushToUser(id, { title, body, url, tag: type }).catch((e) =>
    console.error('Push to user failed:', e)
  )
}
