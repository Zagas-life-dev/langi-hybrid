'use client'
import { useEffect, useRef } from 'react'
import { CaptionOverlay, playerBoxId } from '@/components/VideoCaptions'
import { loadYT, ytNamespace, reportComplete, registerActivePlayer, type YTPlayer, type YTPlayerEvent } from '@/lib/ytPlayer'

/**
 * Watch-page YouTube player (IFrame API, native controls). Subtitles are our own
 * multi-language overlay (YouTube's CC is only a fallback), and it reports completion — fired when the video ENDS or
 * passes 95% watched — so finishing feeds recommendations. Also saves the resume point.
 */
export default function VideoPlayer({
  videoId,
  lang,
  nativeLang,
  title,
  start,
}: {
  videoId: string
  lang: string
  nativeLang: string
  title?: string
  /** Start at this second (e.g. jumping back to where a word was saved). */
  start?: number
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const completedRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    completedRef.current = false

    // Resume point: saved every ~15s of play, on pause, and when leaving.
    // Only after real playback: an unstarted player reports 0 and would wipe
    // the saved point when someone opens a video and leaves straight away.
    let lastSaved = -1
    let played = false
    function saveProgress(how: 'fetch' | 'beacon' = 'fetch') {
      const p = playerRef.current
      if (!played || !p?.getDuration) return
      let position: number, duration: number
      try { position = Math.floor(p.getCurrentTime()); duration = p.getDuration() } catch { return }
      if (!(duration > 0) || position === lastSaved) return
      lastSaved = position
      const url = `/api/videos/${videoId}/progress`
      const body = JSON.stringify({ position, duration })
      keepUrlAt(position)
      if (how === 'beacon' && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      } else {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
      }
    }
    const onHide = () => { if (document.visibilityState === 'hidden') saveProgress('beacon') }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    let ticks = 0

    function markComplete() {
      if (completedRef.current) return
      completedRef.current = true
      reportComplete(videoId)
    }

    loadYT().then(() => {
      if (cancelled || !holderRef.current) return
      const YT = ytNamespace()
      if (!YT) return
      playerRef.current = new YT.Player(holderRef.current, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: {
          rel: 0, modestbranding: 1, playsinline: 1,
          cc_load_policy: 0, cc_lang_pref: lang, hl: lang,
          ...(start ? { start: Math.floor(start) } : {}),
        },
        events: {
          onReady: () => registerActivePlayer(videoId, playerRef.current),
          onStateChange: (e: YTPlayerEvent) => {
            if (e.data === YT.PlayerState.PLAYING) played = true
            if (e.data === YT.PlayerState.ENDED) markComplete()
            if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) saveProgress()
          },
        },
      })
      // Poll progress: count ≥95% watched as finished (covers users who stop
      // just before the end).
      pollRef.current = setInterval(() => {
        const p = playerRef.current
        if (!p?.getDuration) return
        const dur = p.getDuration()
        if (dur > 0 && p.getCurrentTime() / dur >= 0.95) markComplete()
        if (++ticks % 4 === 0 && p.getPlayerState() === YT.PlayerState.PLAYING) saveProgress()
      }, 4000)
    })

    return () => {
      cancelled = true
      saveProgress() // leaving via in-app navigation
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      if (pollRef.current) clearInterval(pollRef.current)
      registerActivePlayer(videoId, null)
      try { playerRef.current?.destroy() } catch { /* already gone */ }
      playerRef.current = null
    }
  }, [videoId, lang, start])

  return (
    <div id={playerBoxId(videoId)} className="relative w-full aspect-video overflow-hidden border-2 border-line rounded-[14px] bg-black" aria-label={title}>
      <div ref={holderRef} className="absolute inset-0 h-full w-full" />
      <CaptionOverlay videoId={videoId} learning={lang} native={nativeLang} />
    </div>
  )
}

/**
 * Mirror the resume point into the address bar as YouTube's `?t=`, so a
 * refresh, bookmark or copied link lands on the same moment. Replaces the
 * history entry rather than adding one.
 */
function keepUrlAt(position: number) {
  try {
    const url = new URL(window.location.href)
    if (position >= 10) url.searchParams.set('t', String(position))
    else url.searchParams.delete('t')
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  } catch { /* ignore */ }
}
