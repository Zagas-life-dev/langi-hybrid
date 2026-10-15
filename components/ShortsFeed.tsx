'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Play } from 'lucide-react'
import type { IVideoItem } from '@/lib/models/VideoCache'
import ShortsPlayer from './ShortsPlayer'
import VideoActions from './VideoActions'

// Vertical, swipeable Shorts feed (TikTok-style). Only the in-view slide mounts
// its player — an IntersectionObserver tracks the active slide. As the active
// slide nears the end we pull more shorts, cycling through level-aware query
// VARIANTS for variety: we paginate a variant until it runs out, then advance to
// the next variant. Everything is server-cached, so scrolling is cheap.
export default function ShortsFeed({
  items: initialItems,
  lang,
  initialNextPageToken,
  initialVariant = 0,
  mode = 'mix',
}: {
  items: IVideoItem[]
  lang: string
  initialNextPageToken?: string | null
  // The server picked a random variant for a fresh feed; continue paginating it.
  initialVariant?: number
  /** Shorts mix: learning, fun/immersion, or both (see ShortsMode in lib/youtube). */
  mode?: 'mix' | 'fun' | 'learn'
}) {
  const [items, setItems] = useState<IVideoItem[]>(initialItems)
  const [activeId, setActiveId] = useState<string | null>(initialItems[0]?.videoId ?? null)
  const itemsRef = useRef(initialItems)
  const variantRef = useRef(initialVariant)
  const tokenRef = useRef<string | null>(initialNextPageToken ?? null)
  const variantCountRef = useRef(10)
  const loadingRef = useRef(false)
  const exhaustedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { itemsRef.current = items }, [items])

  // Track which slide is in view.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset.videoId
            if (id) setActiveId(id)
          }
        }
      },
      { root, threshold: 0.6 }
    )
    root.querySelectorAll('[data-video-id]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  // Record each short as watched once it becomes active (feeds the profile).
  useEffect(() => {
    if (!activeId) return
    fetch(`/api/videos/${activeId}/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {})
  }, [activeId])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || exhaustedRef.current) return
    loadingRef.current = true
    const seen = new Set(itemsRef.current.map((i) => i.videoId))
    const collected: IVideoItem[] = []
    let attempts = 0
    // Keep pulling (cheap, cached) until we surface something new or run out.
    while (collected.length === 0 && !exhaustedRef.current && attempts < 6) {
      attempts++
      try {
        const params = new URLSearchParams({ variant: String(variantRef.current), mode })
        if (tokenRef.current) params.set('pageToken', tokenRef.current)
        const res = await fetch(`/api/shorts?${params}`)
        if (!res.ok) break
        const data = await res.json()
        variantCountRef.current = data.variantCount ?? variantCountRef.current
        for (const it of (data.items || []) as IVideoItem[]) {
          if (!seen.has(it.videoId)) { seen.add(it.videoId); collected.push(it) }
        }
        if (data.nextPageToken) {
          tokenRef.current = data.nextPageToken
        } else {
          variantRef.current += 1
          tokenRef.current = null
          if (variantRef.current >= variantCountRef.current) exhaustedRef.current = true
        }
      } catch {
        break
      }
    }
    if (collected.length) setItems((prev) => [...prev, ...collected])
    loadingRef.current = false
  }, [mode])

  // Pull the next ~50 when the active slide is within 8 of the end, so the feed
  // is topped up well before the user reaches the bottom (no stall on scroll).
  useEffect(() => {
    if (!activeId) return
    const idx = items.findIndex((i) => i.videoId === activeId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (idx >= 0 && idx >= items.length - 8) loadMore()
  }, [activeId, items, loadMore])

  if (!items.length) return null

  return (
    <div ref={containerRef} className="h-full overflow-y-auto snap-y snap-mandatory no-scrollbar">
      {items.map((v) => {
        const active = v.videoId === activeId
        return (
          <div
            key={v.videoId}
            data-video-id={v.videoId}
            className="snap-start h-full flex flex-col items-center gap-2 py-2"
          >
            {/* Video: a height-driven 9:16 box that fills the space above the controls */}
            <div className="flex-1 min-h-0 w-full flex items-center justify-center">
              <div className="relative h-full max-h-full max-w-full aspect-9/16">
                {active ? (
                  <ShortsPlayer videoId={v.videoId} lang={lang} title={v.title} />
                ) : (
                  <div className="relative h-full w-full border-[2.5px] border-line rounded-[24px] bg-paper-dark overflow-hidden">
                    {v.thumbnail && (
                      <Image src={v.thumbnail} alt={v.title} fill sizes="420px" className="object-cover" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Play className="w-12 h-12 text-paper" fill="currentColor" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls at the bottom */}
            <div className="shrink-0 w-full flex justify-center px-2">
              <VideoActions videoId={v.videoId} lang={lang} title={v.title} layout="row" shorts />
            </div>
          </div>
        )
      })}
    </div>
  )
}
