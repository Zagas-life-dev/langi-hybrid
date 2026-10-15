'use client'
import { useState } from 'react'
import { Heart, Share2, BookmarkPlus, Check, MessageSquare } from 'lucide-react'
import AddToPlaylist from './AddToPlaylist'
import CommentsSheet from './CommentsSheet'
import { activeTime, getActivePlayer, WORD_SAVED_EVENT } from '@/lib/ytPlayer'

// Like + Share + Save-word controls for a video. Used on the watch page and on
// each Shorts card. Likes/saves are Langi-native; Share spreads the in-app page.
export default function VideoActions({
  videoId,
  lang,
  title,
  initialLiked = false,
  initialCount = 0,
  layout = 'row',
  shorts = false,
}: {
  videoId: string
  lang: string
  title?: string
  initialLiked?: boolean
  initialCount?: number
  layout?: 'row' | 'column'
  // On shorts, also surface "Comments" + "Add to playlist" (playlist opens upward).
  shorts?: boolean
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [busy, setBusy] = useState(false)
  const [shared, setShared] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [word, setWord] = useState('')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Playback second when the learner opened the box — i.e. when they heard it.
  const [heardAt, setHeardAt] = useState<number | undefined>(undefined)
  const [commentsOpen, setCommentsOpen] = useState(false)

  async function toggleLike() {
    if (busy) return
    setBusy(true)
    // Optimistic update.
    const next = !liked
    setLiked(next)
    setCount((c) => c + (next ? 1 : -1))
    try {
      const res = await fetch(`/api/videos/${videoId}/like`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setLiked(data.liked)
        setCount(data.count)
      } else {
        setLiked(!next) // revert
        setCount((c) => c + (next ? -1 : 1))
      }
    } catch {
      setLiked(!next)
      setCount((c) => c + (next ? -1 : 1))
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    // Like YouTube's "Start at": share from the moment you're at, past the intro.
    const at = activeTime(videoId) ?? 0
    const url = `${window.location.origin}/videos/${videoId}${at >= 10 ? `?t=${at}` : ''}`
    const shareData = { title: title || 'Langi video', text: 'Learning on Langi', url }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(url)
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      }
    } catch {
      /* user dismissed the share sheet — ignore */
    }
  }

  async function saveWord(e: React.FormEvent) {
    e.preventDefault()
    const term = word.trim()
    if (!term || saving) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/words/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, lang, source: { kind: 'video', ref: videoId, t: heardAt } }),
      })
      const data = await res.json()
      if (res.ok) {
        setSaveMsg(
          data.alreadySaved
            ? `Already saved: ${data.card.term} → ${data.card.translation}`
            : `Saved: ${data.card.term} → ${data.card.translation}`
        )
        setWord('')
        window.dispatchEvent(new Event(WORD_SAVED_EVENT))
      } else {
        setSaveMsg(data.error || 'Could not save that word.')
      }
    } catch {
      setSaveMsg('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const wrap = layout === 'column' ? 'flex flex-col gap-3' : 'flex flex-wrap items-center gap-3'

  return (
    <div className={wrap}>
      <button
        onClick={toggleLike}
        disabled={busy}
        className={`flex items-center gap-2 px-3 py-2 border-2 border-line rounded-full text-sm font-bold transition-colors ${
          liked ? 'bg-accent text-on-accent' : 'hover:bg-paper-dark'
        }`}
        aria-pressed={liked}
      >
        <Heart className="w-4 h-4" strokeWidth={2.2} fill={liked ? 'currentColor' : 'none'} />
        {count}
      </button>

      <button
        onClick={share}
        className="flex items-center gap-2 px-3 py-2 border-2 border-line rounded-full text-sm font-bold hover:bg-paper-dark transition-colors"
      >
        {shared ? <Check className="w-4 h-4" strokeWidth={2.2} /> : <Share2 className="w-4 h-4" strokeWidth={2.2} />}
        {shared ? 'Copied' : 'Share'}
      </button>

      <button
        onClick={() => {
          const opening = !saveOpen
          setSaveOpen(opening)
          if (opening) {
            // Pause so the learner can type what they just heard, and remember when.
            setHeardAt(activeTime(videoId))
            try { getActivePlayer(videoId)?.pauseVideo() } catch { /* not ready */ }
          }
        }}
        className="flex items-center gap-2 px-3 py-2 border-2 border-line rounded-full text-sm font-bold hover:bg-paper-dark transition-colors"
      >
        <BookmarkPlus className="w-4 h-4" strokeWidth={2.2} />
        Save word
      </button>

      {shorts && (
        <>
          <button
            onClick={() => setCommentsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 border-2 border-line rounded-full text-sm font-bold hover:bg-paper-dark transition-colors"
          >
            <MessageSquare className="w-4 h-4" strokeWidth={2.2} />
            Comments
          </button>
          <AddToPlaylist videoId={videoId} dropUp />
          <CommentsSheet videoId={videoId} open={commentsOpen} onClose={() => setCommentsOpen(false)} />
        </>
      )}

      {saveOpen && (
        <form onSubmit={saveWord} className="flex items-center gap-2 w-full">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Type a word you heard…"
            className="flex-1 px-3 py-2 border-2 border-line rounded-full bg-paper-raised text-sm focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={saving || !word.trim()}
            className="px-3 py-2 border-2 border-line rounded-full bg-accent text-on-accent text-sm font-bold disabled:opacity-50"
          >
            {saving ? '…' : 'Add'}
          </button>
        </form>
      )}
      {saveMsg && <p className="meta text-muted w-full">{saveMsg}</p>}
    </div>
  )
}
