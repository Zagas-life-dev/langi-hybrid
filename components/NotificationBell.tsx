'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, Check } from 'lucide-react'

interface Notif {
  _id: string
  type: string
  title: string
  body: string
  url: string | null
  read: boolean
  createdAt: string
}

type PushState = 'unsupported' | 'default' | 'granted' | 'denied'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// VAPID public keys are URL-safe base64; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// Register the SW and (re)subscribe to push, telling the server our timezone so
// reminders fire at the learner's local clock hour. Exported so the settings
// page can reuse the exact same opt-in path.
export async function enablePushSubscription(): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) return false
  // Same script URL as PWARegister, or the dev-mode worker would be replaced.
  await navigator.serviceWorker.register(process.env.NODE_ENV === 'development' ? '/sw.js?dev=1' : '/sw.js')
  // register() can resolve before the worker is activated, and subscribing then
  // throws "no active Service Worker". serviceWorker.ready resolves only once an
  // active registration exists, so wait for it before subscribing.
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    }))
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), tzOffsetMinutes: new Date().getTimezoneOffset() }),
  })
  return res.ok
}

// `placement="up"` opens the panel above the bell, left-aligned: used in the
// desktop sidebar footer where there's no room below.
export default function NotificationBell({ placement = 'down' }: { placement?: 'down' | 'up' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [pushState, setPushState] = useState<PushState>('default')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.notifications ?? [])
      setUnread(data.unread ?? 0)
    } catch {
      /* offline / transient — keep last state */
    }
  }, [])

  // Poll for new notifications while mounted (initial fetch + interval).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const id = setInterval(load, 25000)
    return () => clearInterval(id)
  }, [load])

  // Detect push support + permission once on mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unsupported')
      return
    }
    const perm = Notification.permission as PushState
    setPushState(perm)
    if (perm === 'granted') enablePushSubscription().catch(() => {})
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function enablePush() {
    try {
      if (!('serviceWorker' in navigator)) return
      const permission = await Notification.requestPermission()
      setPushState(permission as PushState)
      if (permission === 'granted') await enablePushSubscription()
    } catch (e) {
      console.error('Enable push failed:', e)
    }
  }

  async function markAllRead() {
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {})
  }

  async function onClickItem(n: Notif) {
    setOpen(false)
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)))
      setUnread((u) => Math.max(0, u - 1))
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [n._id] }),
      }).catch(() => {})
    }
    if (n.url) router.push(n.url)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative circle-arrow w-11 h-11 hover:bg-paper-dark cursor-pointer"
        aria-label="Notifications"
      >
        {unread > 0 ? (
          <BellRing className="w-5 h-5 text-accent" strokeWidth={2.4} />
        ) : (
          <Bell className="w-5 h-5" strokeWidth={2.4} />
        )}
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 flex items-center justify-center bg-pink text-on-bright border-2 border-[var(--shadow-ink)] text-[10px] font-extrabold rounded-full">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className={`absolute z-50 w-80 max-w-[calc(100vw-1.5rem)] bg-paper-raised border-[2.5px] border-line rounded-[26px] overflow-hidden shadow-(--shadow-lg) ${placement === 'up' ? 'bottom-full left-0 mb-3' : 'top-full right-0 mt-3'}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <p className="meta">Notifications</p>
              {unread > 0 && (
                <button onClick={markAllRead} className="meta text-muted hover:text-accent transition-colors cursor-pointer">
                  Mark all read
                </button>
              )}
            </div>

            {pushState !== 'granted' && pushState !== 'unsupported' && (
              <button
                onClick={enablePush}
                className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-line text-left text-xs font-semibold hover:bg-paper-dark transition-colors cursor-pointer"
              >
                <BellRing className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={2.2} />
                {pushState === 'denied'
                  ? 'Notifications blocked — enable them in your browser settings'
                  : 'Turn on study reminders'}
              </button>
            )}

            <div className="max-h-96 overflow-y-auto divide-y divide-line/30">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n._id}
                    onClick={() => onClickItem(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-paper-dark transition-colors cursor-pointer ${
                      n.read ? '' : 'bg-accent-soft'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-pink border border-[var(--shadow-ink)] shrink-0" />}
                      <div className={n.read ? 'pl-3.5' : ''}>
                        <p className="text-sm font-semibold leading-snug">{n.title}</p>
                        {n.body && <p className="text-xs text-muted mt-0.5 leading-snug">{n.body}</p>}
                        <p className="meta text-muted/70 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {pushState === 'granted' && (
              <div className="flex items-center gap-1.5 px-4 py-2 border-t border-line meta text-muted">
                <Check className="w-3 h-3 text-accent" strokeWidth={2} /> Study reminders on
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
