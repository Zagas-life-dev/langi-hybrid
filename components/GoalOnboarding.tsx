'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Target, Check } from 'lucide-react'

const OPTIONS = [
  { value: 10, label: 'Casual', sub: '10 cards/day', mins: '~5 min' },
  { value: 20, label: 'Regular', sub: '20 cards/day', mins: '~10 min' },
  { value: 30, label: 'Serious', sub: '30 cards/day', mins: '~15 min' },
  { value: 50, label: 'Intense', sub: '50 cards/day', mins: '~25 min' },
]

export default function GoalOnboarding() {
  const router = useRouter()
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function choose(value: number) {
    if (busy) return
    setPicked(value)
    setBusy(true)
    await fetch('/api/me/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyGoal: value, dailyGoalChosen: true }),
    }).catch(() => {})
    router.refresh()
  }

  return (
    <div className="relative brut-card p-6 sm:p-7 mb-8 shadow-(--shadow-lg)">
      <span className="sticker sticker-ink absolute -top-4 left-6 rotate-[3deg]">On y va ?</span>
      <div className="flex items-center gap-3 mb-1 pt-2">
        <Target className="w-6 h-6 text-accent" strokeWidth={2.4} />
        <p className="display text-3xl">Set your daily goal</p>
      </div>
      <p className="text-ink-soft mb-5">Pick a pace that fits your day. You can change it anytime in Settings.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            disabled={busy}
            className={`border-[2.5px] rounded-[22px] p-4 text-left transition-all disabled:opacity-60 ${
              picked === o.value ? 'border-[var(--shadow-ink)] bg-purple text-on-purple shadow-(--shadow-sm)' : 'border-line bg-paper hover:-translate-y-0.5'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="display text-xl">{o.label}</p>
              {picked === o.value && <Check className="w-5 h-5" strokeWidth={3} />}
            </div>
            <p className="meta mt-1 opacity-80">{o.sub}</p>
            <p className="meta opacity-70">{o.mins}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
