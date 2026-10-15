import webpush from 'web-push'
import PushSubscription from '@/lib/models/PushSubscription'
import { connectDB } from '@/lib/db'

// Server-only — never import into a client component (keeps web-push out of the
// browser bundle). Configured from the VAPID env keys.
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject = process.env.VAPID_SUBJECT || 'mailto:support@langi.app'

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  if (!publicKey || !privateKey) {
    console.warn('Web Push disabled: VAPID keys are not set')
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string | null
  tag?: string
}

// Best-effort push to every device a learner has subscribed. Dead subscriptions
// (expired / unsubscribed → 404/410) are pruned so they aren't retried forever.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return
  await connectDB()

  const subs = await PushSubscription.find({ userId }).lean()
  if (subs.length === 0) return

  const data = JSON.stringify(payload)
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, data)
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint })
        } else {
          console.error('Web Push send failed:', statusCode ?? err)
        }
      }
    })
  )
}
