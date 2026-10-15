'use client'
import { useState } from 'react'
import { History, X } from 'lucide-react'
import { getActivePlayer } from '@/lib/ytPlayer'

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** "Resumed at 3:42 · Start over" — shown when the watch page picked up a saved position. */
export default function ResumeNotice({ videoId, at }: { videoId: string; at: number }) {
  const [shown, setShown] = useState(true)
  if (!shown) return null

  function startOver() {
    const p = getActivePlayer(videoId)
    if (p) { p.seekTo(0, true); p.playVideo() }
    setShown(false)
  }

  return (
    <div className="flex items-center gap-3 mt-3 border-2 border-line rounded-full bg-paper-dark px-3 py-2 text-sm" role="status">
      <History className="w-4 h-4 text-accent shrink-0" strokeWidth={2.2} />
      <span className="flex-1">Resumed where you left off ({fmt(at)})</span>
      <button onClick={startOver} className="meta text-muted hover:text-accent">Start over</button>
      <button onClick={() => setShown(false)} className="text-muted hover:text-accent" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
