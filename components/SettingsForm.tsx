'use client'
import { useEffect, useState } from 'react'
import { Bell, BellRing, Target, Clock, UserRound } from 'lucide-react'
import { enablePushSubscription } from '@/components/NotificationBell'
import { useToast } from '@/components/Toast'

interface Initial {
  pushReminders: boolean
  reminderHour: number
  dailyGoal: number
  displayName: string
}

const GOAL_OPTIONS = [
  { value: 10, label: 'Casual', sub: '10 cards/day' },
  { value: 20, label: 'Regular', sub: '20 cards/day' },
  { value: 30, label: 'Serious', sub: '30 cards/day' },
  { value: 50, label: 'Intense', sub: '50 cards/day' },
]

function hourLabel(h: number): string {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}:00 ${period}`
}

async function savePrefs(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('/api/me/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

export default function SettingsForm({ initial }: { initial: Initial }) {
  const [pushReminders, setPushReminders] = useState(initial.pushReminders)
  const [reminderHour, setReminderHour] = useState(initial.reminderHour)
  const [dailyGoal, setDailyGoal] = useState(initial.dailyGoal)
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  // Read the browser's current push permission once on mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Every preference here saves optimistically, so a failed request used to be
  // completely silent — the toggle stayed flipped and the change was lost.
  // Surface the outcome either way.
  function reportSave(ok: boolean) {
    if (ok) toast('Saved', { tone: 'ok', duration: 1800 })
    else toast("Couldn't save — check your connection", { tone: 'error' })
  }

  async function toggleReminders() {
    if (busy) return
    setBusy(true)
    const next = !pushReminders
    try {
      if (next) {
        // Turning on: make sure the browser has granted permission + a subscription.
        if (permission !== 'granted') {
          const perm = await Notification.requestPermission()
          setPermission(perm)
          if (perm !== 'granted') { setBusy(false); return }
        }
        await enablePushSubscription()
      }
      setPushReminders(next)
      reportSave(await savePrefs({ pushReminders: next }))
    } catch (e) {
      console.error('Toggle reminders failed:', e)
      // Roll the switch back so the UI doesn't claim reminders are on.
      setPushReminders(!next)
      toast("Couldn't update reminders", { tone: 'error' })
    }
    setBusy(false)
  }

  async function onHour(h: number) {
    setReminderHour(h)
    reportSave(await savePrefs({ reminderHour: h }))
  }

  async function onGoal(g: number) {
    setDailyGoal(g)
    reportSave(await savePrefs({ dailyGoal: g, dailyGoalChosen: true }))
  }

  async function onNameBlur() {
    const clean = displayName.trim()
    if (clean === initial.displayName.trim()) return
    reportSave(await savePrefs({ displayName: clean }))
  }

  const remindersOn = pushReminders && permission === 'granted'

  return (
    <div className="space-y-8">
      {/* Public name (league) */}
      <section className="brut-card p-6">
        <div className="flex items-start gap-3 mb-4">
          <UserRound className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
          <div>
            <h2 className="font-medium text-lg">Display name</h2>
            <p className="text-sm text-muted">Shown on the weekly league and to friends. Leave blank to appear anonymously.</p>
          </div>
        </div>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={onNameBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          maxLength={24}
          placeholder="e.g. Kachi"
          className="field-brut w-full"
        />
      </section>

      {/* Study reminders */}
      <section className="brut-card p-6">
        <div className="flex items-start gap-3 mb-5">
          <BellRing className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
          <div>
            <h2 className="font-medium text-lg">Study reminders</h2>
            <p className="text-sm text-muted">A daily push notification so you never break your streak.</p>
          </div>
        </div>

        {permission === 'unsupported' ? (
          <p className="meta text-muted">Your browser doesn&apos;t support push notifications. Try Chrome or Edge.</p>
        ) : (
          <>
            <button
              onClick={toggleReminders}
              disabled={busy}
              className="flex items-center justify-between w-full border-[2.5px] border-line rounded-[24px] p-4 hover:bg-paper-dark transition-colors disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {remindersOn ? <BellRing className="w-4 h-4 text-accent" /> : <Bell className="w-4 h-4 text-muted" />}
                Daily reminder
              </span>
              <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${remindersOn ? 'bg-accent' : 'bg-ink/20'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${remindersOn ? 'translate-x-6' : 'translate-x-1'}`} />
              </span>
            </button>
            {permission === 'denied' && (
              <p className="meta text-accent2 mt-3">Notifications are blocked. Enable them in your browser settings, then toggle this on.</p>
            )}

            <div className={`mt-5 ${remindersOn ? '' : 'opacity-50 pointer-events-none'}`}>
              <label className="flex items-center gap-2 meta text-muted mb-2">
                <Clock className="w-4 h-4" /> Remind me at
              </label>
              <select
                value={reminderHour}
                onChange={(e) => onHour(Number(e.target.value))}
                className="field-brut w-full"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
              <p className="meta text-muted mt-2">Reminders fire only if you haven&apos;t studied yet that day.</p>
            </div>
          </>
        )}
      </section>

      {/* Daily goal */}
      <section className="brut-card p-6">
        <div className="flex items-start gap-3 mb-5">
          <Target className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
          <div>
            <h2 className="font-medium text-lg">Daily goal</h2>
            <p className="text-sm text-muted">How many cards you aim to review each day.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {GOAL_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => onGoal(o.value)}
              className={`border p-4 text-left transition-colors ${
                dailyGoal === o.value ? 'border-accent bg-accent/5' : 'border-line hover:bg-paper-dark'
              }`}
            >
              <p className="font-medium">{o.label}</p>
              <p className="meta text-muted">{o.sub}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
