'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Microscope, Sparkles, Wand2 } from 'lucide-react'
import { checkText, deepDive, type CheckResult } from '@/lib/hybrid/liveCorrect'
import { highlight, type Mistake } from '@/lib/hybrid/correctCore'
import { warmUpDevice } from '@/lib/hybrid/ai'
import { firebaseConfigured } from '@/lib/hybrid/firebase'
import HybridBadge from '@/components/HybridBadge'

// Live Correct: as the learner types, a short pause triggers an on-device check (Gemini Nano
// through Firebase AI Logic). Nothing is sent to a server; it works offline.

export interface LiveState {
  phase: 'idle' | 'checking' | 'done' | 'error'
  /** The exact text this result is for. */
  checked: string
  result: CheckResult | null
  error?: string
}

const IDLE: LiveState = { phase: 'idle', checked: '', result: null }
const MIN_CHARS = 8

export function useLiveCorrect(text: string, lang: string, enabled = true, delayMs = 600): LiveState {
  const [state, setState] = useState<LiveState>(IDLE)
  const seq = useRef(0)

  // Load Nano into memory once, so the first real check is not the slow one.
  useEffect(() => { if (enabled && firebaseConfigured()) warmUpDevice().catch(() => {}) }, [enabled])

  useEffect(() => {
    const id = ++seq.current
    const t = text.trim()
    const timer = setTimeout(async () => {
      if (!enabled || !firebaseConfigured() || t.length < MIN_CHARS) { setState(IDLE); return }
      setState((s) => ({ ...s, phase: 'checking', checked: t }))
      try {
        const result = await checkText(t, lang)
        if (id === seq.current) setState({ phase: 'done', checked: t, result })
      } catch (e) {
        if (id === seq.current) setState({ phase: 'error', checked: t, result: null, error: (e as Error).message })
      }
    }, delayMs)
    return () => clearTimeout(timer)
  }, [text, lang, enabled, delayMs])

  return state
}

/** Shows the learner's text with wrong spans underlined, the fix, and a Deep Dive per mistake. */
export function LiveCorrectPanel({
  text, state, lang, level = 'A2', onApply,
}: {
  text: string
  state: LiveState
  lang: string
  level?: string
  /** Replace the learner's text with the corrected sentence. */
  onApply?: (corrected: string) => void
}) {
  const [dive, setDive] = useState<{ key: string; text: string; busy: boolean; badge?: { source: 'ON_DEVICE' | 'IN_CLOUD'; ms: number; reason: string }; error?: string } | null>(null)
  // A result for older text is stale: dim it instead of showing the wrong highlights.
  const stale = state.checked !== text.trim()

  if (state.phase === 'idle') return null
  if (state.phase === 'error') {
    return <p className="meta text-muted mt-2" role="status">Live Correct paused: {state.error || 'AI unavailable'}</p>
  }
  const r = state.result
  if (state.phase === 'checking' && !r) {
    return <p className="meta text-muted mt-2 flex items-center gap-2" role="status"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking on your device…</p>
  }
  if (!r) return null

  async function runDive(m: Mistake | undefined, key: string) {
    setDive({ key, text: '', busy: true })
    try {
      const out = await deepDive({
        sentence: state.checked, mistake: m, lang, level,
        onText: (soFar) => setDive((d) => (d && d.key === key ? { ...d, text: soFar } : d)),
      })
      setDive({ key, text: out.text, busy: false, badge: { source: out.source, ms: out.ms, reason: out.reason } })
    } catch (e) {
      setDive({ key, text: '', busy: false, error: (e as Error).message || 'Could not load the breakdown' })
    }
  }

  return (
    <div className={`mt-2 transition-opacity ${stale ? 'opacity-50' : ''}`} role="status" aria-live="polite" data-testid="live-correct">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        {r.ok ? (
          <span className="chip bg-lime text-on-bright border-(--shadow-ink)"><Check className="w-3.5 h-3.5" strokeWidth={3} /> Looks good</span>
        ) : (
          <span className="chip bg-yellow text-on-bright border-(--shadow-ink)"><Sparkles className="w-3.5 h-3.5" /> {r.mistakes.length || 1} to fix</span>
        )}
        <HybridBadge source={r.source} ms={r.firstTokenMs ?? r.ms} reason={r.reason} />
      </div>

      {!r.ok && (
        <div className="fix-box block">
          <p className="leading-relaxed">
            {highlight(state.checked, r.mistakes).map((seg, i) => seg.mistake
              ? <mark key={i} className="bg-pink/70 text-inherit rounded px-0.5 underline decoration-wavy decoration-accent2 underline-offset-4" title={`${seg.mistake.right}${seg.mistake.why ? ` — ${seg.mistake.why}` : ''}`}>{seg.text}</mark>
              : <span key={i}>{seg.text}</span>)}
          </p>
          <p className="font-extrabold mt-1.5 flex items-start gap-2">
            <span className="flex-1">{r.corrected}</span>
            {onApply && !stale && (
              <button type="button" onClick={() => onApply(r.corrected)} className="btn-ghost min-h-9 px-3 text-sm shrink-0">
                <Wand2 className="w-4 h-4" strokeWidth={2.4} /> Use this
              </button>
            )}
          </p>
          {r.mistakes.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {r.mistakes.map((m, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="flex-1"><s className="opacity-70">{m.wrong}</s> → <strong className="font-extrabold">{m.right}</strong>{m.why ? <span className="text-muted"> · {m.why}</span> : null}</span>
                  <button type="button" onClick={() => runDive(m, `m${i}`)} disabled={dive?.busy}
                    className="meta text-muted hover:text-accent inline-flex items-center gap-1 shrink-0" title="Full breakdown from the cloud">
                    <Microscope className="w-3.5 h-3.5" /> Deep Dive
                  </button>
                </li>
              ))}
            </ul>
          )}
          {r.mistakes.length === 0 && (
            <button type="button" onClick={() => runDive(undefined, 'all')} disabled={dive?.busy}
              className="meta text-muted hover:text-accent inline-flex items-center gap-1 mt-2">
              <Microscope className="w-3.5 h-3.5" /> Deep Dive
            </button>
          )}
        </div>
      )}

      {dive && (
        <div className="brut-card mt-2 p-4 text-sm" data-testid="deep-dive">
          <div className="flex items-center gap-2 mb-2">
            <p className="font-extrabold flex items-center gap-1.5"><Microscope className="w-4 h-4" /> Deep Dive</p>
            {dive.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : dive.badge && <HybridBadge {...dive.badge} />}
          </div>
          {dive.error ? <p className="text-accent2" role="alert">{dive.error}</p> : <p className="whitespace-pre-wrap leading-relaxed">{dive.text.replace(/\*\*/g, '') || 'Asking the cloud…'}</p>}
        </div>
      )}
    </div>
  )
}
