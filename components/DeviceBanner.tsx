'use client'
import { useState, useSyncExternalStore } from 'react'
import { Cloud, Cpu, Download, Loader2, X } from 'lucide-react'
import { deviceDiagnostics, deviceStatus, enableOnDevice } from '@/lib/hybrid/ai'
import { deviceNotice, type DeviceFacts, type DeviceStatus } from '@/lib/hybrid/deviceCore'

// Graceful "no on-device model" state. One shared store so the banner and the HUD status line agree.

interface Snapshot { status: DeviceStatus | 'checking'; facts: DeviceFacts | null }
const CHECKING: Snapshot = { status: 'checking', facts: null }
let snap: Snapshot = CHECKING
let started = false
const listeners = new Set<() => void>()

function set(next: Snapshot) {
  snap = next
  listeners.forEach((l) => l())
}

export async function refreshNano() {
  const [status, d] = await Promise.all([deviceStatus(), deviceDiagnostics().catch(() => null)])
  set({ status, facts: d ? { chrome: d.chrome, hasPromptApi: d.hasPromptApi } : null })
}

function subscribe(l: () => void) {
  listeners.add(l)
  if (!started) { started = true; refreshNano().catch(() => set({ status: 'unavailable', facts: null })) }
  return () => listeners.delete(l)
}

export function useNano(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap, () => CHECKING)
}

const DISMISS_KEY = 'langi.nano.dismissed'

/** A slim status line for the HUD card: is Gemini Nano usable here? */
export function NanoStatusLine() {
  const { status } = useNano()
  if (status === 'checking') return null
  const label: Record<DeviceStatus, string> = {
    available: 'Gemini Nano ready',
    downloadable: 'Gemini Nano: not downloaded',
    downloading: 'Gemini Nano: downloading',
    unavailable: 'Cloud-only on this device',
    unsupported: 'Cloud-only in this browser',
  }
  const local = status === 'available'
  return (
    <p className="meta text-muted mt-1.5 flex items-center gap-1.5" data-testid="nano-status" data-status={status}>
      {local ? <Cpu className="w-3.5 h-3.5" strokeWidth={2.4} /> : <Cloud className="w-3.5 h-3.5" strokeWidth={2.4} />}
      {label[status]}
    </p>
  )
}

/** Top-of-app notice: offers the one-time on-device download, or explains cloud-only mode. */
export default function DeviceBanner() {
  const { status, facts } = useNano()
  // The status we last dismissed. Read once; the banner renders nothing on the server, so no mismatch.
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
  })
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const notice = deviceNotice(status, facts)
  if (notice.kind === 'ready' || dismissed === status) return null

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, status) } catch { /* ignore */ }
    setDismissed(status)
  }

  // Chrome only starts the model download from a click, so this runs straight from the button.
  function enable() {
    setError(null)
    setProgress(0)
    enableOnDevice((f) => setProgress(f))
      .then(() => refreshNano())
      .catch((e: Error) => setError(e.message || 'Could not download the model'))
      .finally(() => setProgress(null))
  }

  const cloud = notice.kind === 'cloud'
  return (
    <section role="status" aria-live="polite" data-testid="device-banner" data-kind={notice.kind}
      className={`brut-card mx-3 md:mx-0 mt-3 md:mt-0 mb-4 p-4 flex items-start gap-3 ${cloud ? 'bg-paper-raised' : 'bg-lime/40'}`}>
      <span className={`w-10 h-10 shrink-0 rounded-full border-[2.5px] border-(--shadow-ink) flex items-center justify-center text-on-bright ${cloud ? 'bg-sky' : 'bg-lime'}`}>
        {cloud ? <Cloud className="w-5 h-5" strokeWidth={2.4} /> : <Cpu className="w-5 h-5" strokeWidth={2.4} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-extrabold">{notice.title}</p>
        <p className="text-sm text-ink-soft mt-0.5">{notice.body}</p>
        {notice.kind === 'enable' && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button onClick={enable} disabled={progress !== null} className="btn-ink min-h-10 px-4 text-sm">
              {progress !== null
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Downloading{progress > 0 ? ` ${Math.round(progress * 100)}%` : '…'}</>
                : <><Download className="w-4 h-4" strokeWidth={2.4} /> {status === 'downloading' ? 'Resume download' : 'Turn on on-device AI'}</>}
            </button>
            {progress !== null && (
              <span className="h-2 w-32 rounded-full bg-paper-dark overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span className="block h-full bg-lime" style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            )}
          </div>
        )}
        {error && <p className="meta text-accent2 mt-2" role="alert">{error}</p>}
      </div>
      <button onClick={dismiss} className="shrink-0 text-muted hover:text-accent" aria-label="Dismiss this notice">
        <X className="w-4 h-4" />
      </button>
    </section>
  )
}
