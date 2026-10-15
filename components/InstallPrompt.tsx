'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, X, Share } from 'lucide-react'

// Prompts the learner to install Langi to their device so it lives on the home
// screen and runs offline. Two paths:
//   • Chrome/Edge/Android fire `beforeinstallprompt` — we capture it and drive
//     the native installer from our own button.
//   • iOS Safari has no such event, so we show the manual "Share → Add to Home
//     Screen" hint instead (only when not already installed).
// Dismissal is remembered so we never nag.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'langi-install-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes navigator.standalone instead of display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
}

// iOS "Add to Home Screen" eligibility is a static, page-lifetime fact, so read
// it via useSyncExternalStore (server snapshot = false → no hydration flash, no
// setState-in-effect), matching the capability pattern in lib/speech.ts.
const noopSubscribe = () => () => {}
function useIosHintEligible(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => isIOS() && !isStandalone() && localStorage.getItem(DISMISS_KEY) !== '1',
    () => false
  )
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false) // set only from user/appinstalled events
  const iosHintEligible = useIosHintEligible()

  // Effect only wires up event listeners — no setState in its body, so it can't
  // trigger cascading renders. All state changes happen inside the callbacks.
  useEffect(() => {
    if (isStandalone()) return
    const onPrompt = (e: Event) => {
      e.preventDefault() // stop Chrome's mini-infobar; we drive it from our button
      if (localStorage.getItem(DISMISS_KEY) !== '1') setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferred(null)
      setHidden(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {}
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setDeferred(null)
    dismiss()
  }

  if (hidden) return null
  if (!deferred && !iosHintEligible) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,26rem)] border-[2.5px] border-line rounded-[32px] bg-paper-raised shadow-(--shadow-lg) px-4 py-3">
      <button onClick={dismiss} aria-label="Dismiss" className="absolute top-2 right-2 text-muted hover:text-ink">
        <X className="w-4 h-4" />
      </button>
      {deferred ? (
        <div className="flex items-center gap-3 pr-4">
          <Download className="w-6 h-6 text-accent shrink-0" strokeWidth={2.2} />
          <div className="flex-1">
            <p className="font-medium text-sm">Install Langi</p>
            <p className="meta text-muted">Add it to your device — study and flashcards work offline.</p>
          </div>
          <button onClick={install} className="btn-ink shrink-0 text-sm">Install</button>
        </div>
      ) : (
        <div className="flex items-center gap-3 pr-4">
          <Share className="w-6 h-6 text-accent shrink-0" strokeWidth={2.2} />
          <div className="flex-1">
            <p className="font-medium text-sm">Install Langi</p>
            <p className="meta text-muted">Tap <span className="font-medium">Share</span> then <span className="font-medium">Add to Home Screen</span> — flashcards work offline.</p>
          </div>
        </div>
      )}
    </div>
  )
}
