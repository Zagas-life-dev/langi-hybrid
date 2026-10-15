'use client'
import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { loadYT, ytNamespace, reportComplete, type YTPlayer, type YTPlayerEvent } from '@/lib/ytPlayer'

/**
 * Vertical Shorts player on the YouTube IFrame API. Native controls are hidden;
 * a full-bleed tap target toggles play/pause. The control glyph only FLASHES
 * briefly on tap then fades — so even when paused there's no persistent overlay;
 * tapping a paused video brings the glyph up and resumes. Reports completion on
 * the first end so finished shorts feed recommendations.
 */
export default function ShortsPlayer({ videoId, lang, title }: { videoId: string; lang: string; title?: string }) {
  const holderRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const completedRef = useRef(false)
  const [flash, setFlash] = useState<'play' | 'pause' | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    completedRef.current = false
    loadYT().then(() => {
      if (cancelled || !holderRef.current) return
      const YT = ytNamespace()
      if (!YT) return
      playerRef.current = new YT.Player(holderRef.current, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: {
          autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1,
          cc_load_policy: 1, cc_lang_pref: lang, hl: lang,
        },
        events: {
          onReady: (e: YTPlayerEvent) => e.target.playVideo(),
          onStateChange: (e: YTPlayerEvent) => {
            if (e.data === YT.PlayerState.ENDED) {
              if (!completedRef.current) { completedRef.current = true; reportComplete(videoId) }
              e.target.seekTo(0); e.target.playVideo() // loop
            }
          },
        },
      })
    })
    return () => {
      cancelled = true
      if (flashTimer.current) clearTimeout(flashTimer.current)
      try { playerRef.current?.destroy() } catch { /* already gone */ }
      playerRef.current = null
    }
  }, [videoId, lang])

  function showFlash(icon: 'play' | 'pause') {
    setFlash(icon)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 450)
  }

  function toggle() {
    const p = playerRef.current
    const YT = ytNamespace()
    if (!p || !YT) return
    if (p.getPlayerState() === YT.PlayerState.PLAYING) { p.pauseVideo(); showFlash('pause') }
    else { p.playVideo(); showFlash('play') }
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden border-[2.5px] border-line rounded-[24px]">
      <div ref={holderRef} className="absolute inset-0 h-full w-full" />
      <button
        type="button"
        onClick={toggle}
        className="absolute inset-0 z-10 flex items-center justify-center"
        aria-label={`Play or pause ${title ?? 'video'}`}
      >
        <span className={`rounded-full bg-black/45 p-4 transition-opacity duration-300 ${flash ? 'opacity-100' : 'opacity-0'}`}>
          {flash === 'pause'
            ? <Pause className="w-12 h-12 text-white" fill="currentColor" />
            : <Play className="w-12 h-12 text-white" fill="currentColor" />}
        </span>
      </button>
    </div>
  )
}
