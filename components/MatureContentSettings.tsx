'use client'
import { useState } from 'react'
import { ShieldAlert, Cake, Check } from 'lucide-react'
import { isAdult } from '@/lib/age'

async function savePrefs(body: Record<string, unknown>): Promise<Response> {
  return fetch('/api/me/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Age-gated mature-content controls. Date of birth decides adult status; the
// Mature toggle is adult-only and the server enforces it (a minor can't enable it).
export default function MatureContentSettings({
  initialBirthdate,
  initialMature,
}: {
  initialBirthdate: string // YYYY-MM-DD or ''
  initialMature: boolean
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [birthdate, setBirthdate] = useState(initialBirthdate)
  const [mature, setMature] = useState(initialMature)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const adult = isAdult(birthdate || null)

  function flash() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function onBirthdate(v: string) {
    setBirthdate(v)
    setError(null)
    if (!v) return
    const res = await savePrefs({ birthdate: v })
    if (res.ok) flash()
    // If they're no longer adult, mature is meaningless — reflect that locally.
    if (!isAdult(v) && mature) setMature(false)
  }

  async function toggleMature() {
    if (busy || !adult) return
    setBusy(true); setError(null)
    const next = !mature
    setMature(next)
    const res = await savePrefs({ matureContent: next })
    if (!res.ok) {
      setMature(!next)
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Could not update.')
    } else flash()
    setBusy(false)
  }

  return (
    <section className="brut-card p-6">
      {saved && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-purple text-on-purple px-4 py-2 shadow-[4px_4px_0_var(--accent)]">
          <Check className="w-4 h-4" /> <span className="meta">Saved</span>
        </div>
      )}
      <div className="flex items-start gap-3 mb-5">
        <ShieldAlert className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
        <div>
          <h2 className="font-medium text-lg">Content & maturity</h2>
          <p className="text-sm text-muted">Mature stories can be dark, intense and graphic. They&apos;re for adults only and off by default.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 meta text-muted mb-2"><Cake className="w-4 h-4" /> Date of birth</label>
      <input type="date" value={birthdate} max={today} onChange={(e) => onBirthdate(e.target.value)} className="field-brut w-full mb-2" />
      <p className="meta text-muted mb-5">
        {birthdate ? (adult ? 'Verified adult (18+).' : 'Under 18 — mature content stays off.') : 'Set your date of birth to unlock the mature toggle.'}
      </p>

      <button
        onClick={toggleMature}
        disabled={!adult || busy}
        className={`flex items-center justify-between w-full border-[2.5px] border-line rounded-[24px] p-4 transition-colors disabled:opacity-50 ${adult ? 'hover:bg-paper-dark' : 'cursor-not-allowed'}`}
      >
        <span className="text-sm font-medium text-left">
          Mature content
          <span className="block meta text-muted font-normal">Graphic/intense adult stories (no explicit sexual content)</span>
        </span>
        <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${mature && adult ? 'bg-accent' : 'bg-ink/20'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${mature && adult ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
      </button>
      {error && <p className="meta text-accent2 mt-3">{error}</p>}
    </section>
  )
}
