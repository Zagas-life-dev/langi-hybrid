'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { RotateCcw, Repeat, X } from 'lucide-react'
import { getActivePlayer, subscribeActivePlayer } from '@/lib/ytPlayer'
import { CaptionPicker } from '@/components/VideoCaptions'

const SPEEDS = [0.5, 0.75, 1]

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Learner controls under the watch-page player: "say that again" (replay 5s),
 * slow-down, an A-B loop for drilling one line until it's understood, and the
 * subtitle-language picker.
 * Talks to the player through the active-player registry in lib/ytPlayer.
 */
export default function VideoStudyBar({ videoId, learning, native }: { videoId: string; learning: string; native: string }) {
  const player = useSyncExternalStore(subscribeActivePlayer, () => getActivePlayer(videoId), () => null)
  const [rate, setRate] = useState(1)
  const [a, setA] = useState<number | null>(null)
  const [b, setB] = useState<number | null>(null)

  // Enforce the loop: whenever playback passes B, jump back to A.
  useEffect(() => {
    if (!player || a === null || b === null) return
    const id = setInterval(() => {
      try { if (player.getCurrentTime() >= b) player.seekTo(a, true) } catch { /* player gone */ }
    }, 200)
    return () => clearInterval(id)
  }, [player, a, b])

  const ready = Boolean(player)
  const now = () => { try { return player?.getCurrentTime() ?? 0 } catch { return 0 } }

  function replay() {
    if (!player) return
    player.seekTo(Math.max(0, now() - 5), true)
    player.playVideo()
  }

  function speed(r: number) {
    player?.setPlaybackRate?.(r)
    setRate(r)
  }

  function markLoop() {
    const t = now()
    if (a === null || b !== null) { setA(t); setB(null) } // start (or restart) a loop
    else if (t > a + 0.5) { setB(t); player?.seekTo(a, true) }
  }

  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 border-2 border-line rounded-full text-xs font-bold transition-colors disabled:opacity-40'

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3" aria-label="Study controls">
      <CaptionPicker videoId={videoId} learning={learning} native={native} />

      <button onClick={replay} disabled={!ready} className={`${btn} hover:bg-paper-dark`} title="Replay the last 5 seconds">
        <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.2} /> 5s
      </button>

      <span className="inline-flex border-[2.5px] border-line rounded-[24px]" role="group" aria-label="Playback speed">
        {SPEEDS.map((r) => (
          <button key={r} onClick={() => speed(r)} disabled={!ready} aria-pressed={rate === r}
            className={`px-2.5 py-1.5 text-xs font-mono disabled:opacity-40 ${rate === r ? 'bg-purple text-on-purple' : 'hover:bg-paper-dark'}`}>
            {r}×
          </button>
        ))}
      </span>

      <button onClick={markLoop} disabled={!ready}
        className={`${btn} ${a !== null && b !== null ? 'bg-accent text-on-accent border-accent' : 'hover:bg-paper-dark'}`}
        title="Tap at the start of a line, then again at its end, to loop it">
        <Repeat className="w-3.5 h-3.5" strokeWidth={2.2} />
        {a === null ? 'Loop A–B' : b === null ? `A ${fmt(a)} · tap for B` : `${fmt(a)}–${fmt(b)}`}
      </button>
      {a !== null && (
        <button onClick={() => { setA(null); setB(null) }} className="text-muted hover:text-accent" aria-label="Clear loop">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
