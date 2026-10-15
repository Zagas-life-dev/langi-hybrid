'use client'
import { useState } from 'react'
import { Heart, Bookmark, Globe, Lock, Flag, Check } from 'lucide-react'

// Like / Save / (owner) Publish / (viewer) Report controls for a story, mirroring
// the videos page. Optimistic toggles with server reconciliation.
export default function StorySocialBar({
  storyId,
  isOwner,
  initialPublished = false,
  initialLiked = false,
  initialLikes = 0,
  initialSaved = false,
}: {
  storyId: string
  isOwner: boolean
  initialPublished?: boolean
  initialLiked?: boolean
  initialLikes?: number
  initialSaved?: boolean
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [likes, setLikes] = useState(initialLikes)
  const [saved, setSaved] = useState(initialSaved)
  const [published, setPublished] = useState(initialPublished)
  const [reported, setReported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function toggleLike() {
    if (busy) return
    setBusy(true)
    const next = !liked
    setLiked(next); setLikes((c) => c + (next ? 1 : -1))
    try {
      const res = await fetch(`/api/stories/${storyId}/like`, { method: 'POST' })
      if (res.ok) { const d = await res.json(); setLiked(d.liked); setLikes(d.count) }
      else { setLiked(!next); setLikes((c) => c + (next ? -1 : 1)) }
    } catch { setLiked(!next); setLikes((c) => c + (next ? -1 : 1)) }
    setBusy(false)
  }

  async function toggleSave() {
    if (busy) return
    setBusy(true)
    const next = !saved
    setSaved(next)
    try {
      const res = await fetch(`/api/stories/${storyId}/save`, { method: 'POST' })
      if (res.ok) { const d = await res.json(); setSaved(d.saved) }
      else setSaved(!next)
    } catch { setSaved(!next) }
    setBusy(false)
  }

  async function togglePublish() {
    if (busy) return
    setBusy(true); setNote(null)
    try {
      const res = await fetch(`/api/stories/${storyId}/publish`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) { setPublished(d.published); setNote(d.published ? 'Published — others can read it now.' : 'Unpublished.') }
      else setNote(d.error || 'Could not update.')
    } catch { setNote('Could not update.') }
    setBusy(false)
  }

  async function report() {
    if (busy || reported) return
    if (!confirm('Report this story as inappropriate?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/stories/${storyId}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (res.ok) { setReported(true); setNote('Thanks — reported for review.') }
    } catch { /* ignore */ }
    setBusy(false)
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={toggleLike} disabled={busy}
          className={`btn-ghost ${liked ? 'text-accent2 border-accent2' : ''}`} aria-pressed={liked}>
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} /> {likes}
        </button>
        <button onClick={toggleSave} disabled={busy}
          className={`btn-ghost ${saved ? 'text-accent border-accent' : ''}`} aria-pressed={saved}>
          <Bookmark className={`w-4 h-4 ${saved ? 'fill-current' : ''}`} /> {saved ? 'Saved' : 'Save'}
        </button>

        {isOwner ? (
          <button onClick={togglePublish} disabled={busy} className={`btn-ghost ${published ? 'text-ok border-ok' : ''}`}>
            {published ? <><Globe className="w-4 h-4" /> Published</> : <><Lock className="w-4 h-4" /> Publish</>}
          </button>
        ) : (
          <button onClick={report} disabled={busy || reported} className="btn-ghost text-muted">
            {reported ? <><Check className="w-4 h-4" /> Reported</> : <><Flag className="w-4 h-4" /> Report</>}
          </button>
        )}
      </div>
      {note && <p className="meta text-muted mt-2">{note}</p>}
    </div>
  )
}
