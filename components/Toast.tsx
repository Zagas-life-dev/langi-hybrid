'use client'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Check, AlertCircle, Info } from 'lucide-react'

export type ToastTone = 'ok' | 'error' | 'info'

export interface Toast {
  id: string
  text: string
  tone: ToastTone
  /** Rendered instead of the tone icon — used for achievement emoji. */
  icon?: string
  leaving?: boolean
}

interface ToastCtx {
  /** Show a toast. Returns its id so callers can dismiss it early. */
  toast: (text: string, opts?: { tone?: ToastTone; icon?: string; duration?: number }) => string
  dismiss: (id: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)

const TONE_ICON = { ok: Check, error: AlertCircle, info: Info }
const EXIT_MS = 200

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Timers are cleared on manual dismiss so a toast can't be removed twice.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  // Two-step exit: flag the toast so CSS can animate it out, then unmount.
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.set(id, setTimeout(() => remove(id), EXIT_MS))
  }, [remove])

  const toast = useCallback<ToastCtx['toast']>((text, opts) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const duration = opts?.duration ?? 3200
    setToasts((prev) => [...prev, { id, text, tone: opts?.tone ?? 'info', icon: opts?.icon }])
    timers.current.set(id, setTimeout(() => dismiss(id), duration))
    return id
  }, [dismiss])

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Fixed viewport layer. pointer-events-none on the wrapper so toasts
          never block taps on the page beneath; each .toast re-enables its own. */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-60 flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-sm"
        style={{ top: 'calc(var(--safe-t) + 4.5rem)' }}
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => {
          const Icon = TONE_ICON[t.tone]
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => dismiss(t.id)}
              className="toast w-full text-left"
              data-tone={t.tone}
              data-leaving={t.leaving ? 'true' : undefined}
            >
              {t.icon
                ? <span className="text-base leading-none shrink-0">{t.icon}</span>
                : <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />}
              <span className="flex-1">{t.text}</span>
            </button>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

// Inert fallback: a missing provider must not be fatal. ReviewSession — the
// core study loop — calls useToast, and losing a celebration toast is not worth
// taking the whole session down. Same reasoning as useTheme in ThemeProvider.
const FALLBACK: ToastCtx = { toast: () => '', dismiss: () => {} }

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (ctx) return ctx
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[toast] useToast() called outside <ToastProvider> — toasts disabled.')
  }
  return FALLBACK
}
