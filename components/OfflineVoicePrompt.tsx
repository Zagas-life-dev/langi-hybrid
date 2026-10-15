'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Mic, X, Check } from 'lucide-react'
import { useLang } from '@/components/LangProvider'
import { useOnline } from '@/lib/offlineQueue'
import { offlineSttAvailable, sttModelFor } from '@/lib/sttModels'
import { voskRuntimeSupported, isModelDownloaded, loadModel } from '@/lib/voskStt'

// One-time nudge, shown after the learner INSTALLS Langi (running standalone) and
// is online, offering to download the ~40 MB on-device dictation model for their
// language so voice answers work with no connection. Offline TTS/pronunciation is
// already free on install — this is only the speech-to-text model. Dismissed or
// completed → never shown again for that language.

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

// Installed + this language has a model + the browser can run Vosk. Static for the
// session, so read via useSyncExternalStore (no setState-in-effect, no SSR flash).
const noopSubscribe = () => () => {}
function useEligibleEnv(lang: string): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => isStandalone() && offlineSttAvailable(lang) && voskRuntimeSupported(),
    () => false
  )
}

type Phase = 'hidden' | 'offer' | 'downloading' | 'done' | 'error'

export default function OfflineVoicePrompt() {
  const { learningLang, meta } = useLang()
  const online = useOnline()
  const eligible = useEligibleEnv(learningLang)
  const model = sttModelFor(learningLang)
  const dismissKey = `langi-voicepack-${learningLang}`

  const [phase, setPhase] = useState<Phase>('hidden')
  const [progress, setProgress] = useState(0)

  // Decide whether to offer — all setState is in the async continuation, so this
  // never synchronously sets state in the effect body.
  useEffect(() => {
    if (!eligible || !model) return
    let cancelled = false
    ;(async () => {
      try {
        if (localStorage.getItem(dismissKey)) return
      } catch {}
      const already = await isModelDownloaded(model)
      if (!cancelled && !already) setPhase('offer')
    })()
    return () => { cancelled = true }
  }, [eligible, model, dismissKey])

  function remember() {
    try { localStorage.setItem(dismissKey, '1') } catch {}
  }
  function dismiss() {
    setPhase('hidden')
    remember()
  }
  async function download() {
    if (!model) return
    setPhase('downloading')
    setProgress(0)
    try {
      await loadModel(model, (p) => setProgress(p))
      remember()
      setPhase('done')
      setTimeout(() => setPhase('hidden'), 2500)
    } catch {
      setPhase('error')
    }
  }

  if (phase === 'hidden') return null
  // Can't download without a connection — hide the offer until back online.
  if (phase === 'offer' && !online) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,26rem)] border-[2.5px] border-line rounded-[32px] bg-paper-raised shadow-(--shadow-lg) px-4 py-3">
      {phase !== 'downloading' && phase !== 'done' && (
        <button onClick={dismiss} aria-label="Dismiss" className="absolute top-2 right-2 text-muted hover:text-ink">
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-center gap-3 pr-4">
        <span className="shrink-0 text-accent">
          {phase === 'done' ? <Check className="w-6 h-6" strokeWidth={2.2} /> : <Mic className="w-6 h-6" strokeWidth={2.2} />}
        </span>
        <div className="flex-1 min-w-0">
          {phase === 'offer' && (
            <>
              <p className="font-medium text-sm">Offline voice for {meta.name}</p>
              <p className="meta text-muted">Download the on-device dictation model (~{model?.sizeMB ?? 40} MB) so speaking your answers works with no connection.</p>
            </>
          )}
          {phase === 'downloading' && (
            <>
              <p className="font-medium text-sm">Downloading offline voice… {Math.round(progress * 100)}%</p>
              <div className="h-1.5 bg-ink/10 mt-2">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </>
          )}
          {phase === 'done' && <p className="font-medium text-sm">Offline voice ready — dictation now works offline.</p>}
          {phase === 'error' && (
            <>
              <p className="font-medium text-sm">Download failed</p>
              <p className="meta text-muted">Check your connection and try again.</p>
            </>
          )}
        </div>
        {phase === 'offer' && (
          <button onClick={download} className="btn-ink shrink-0 text-sm">Download</button>
        )}
        {phase === 'error' && (
          <button onClick={download} className="btn-ink shrink-0 text-sm">Retry</button>
        )}
      </div>
    </div>
  )
}
