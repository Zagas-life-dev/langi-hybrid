'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Create a playlist or course, then jump to its detail page to add videos.
export default function CreatePlaylistForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isCourse, setIsCourse] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, isCourse, isPublic }),
      })
      const data = await res.json()
      if (res.ok) router.push(`/courses/${data.id}`)
      else setError(data.error || 'Could not create playlist')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="brut-card p-6 space-y-5 max-w-xl">
      <div>
        <label className="meta text-muted block mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. French A1 from scratch"
          className="w-full px-3 py-2 border-[2.5px] border-line rounded-[24px] bg-paper-raised focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="meta text-muted block mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What is this playlist for?"
          className="w-full px-3 py-2 border-[2.5px] border-line rounded-[24px] bg-paper-raised focus:outline-none focus:border-accent resize-y"
        />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={isCourse} onChange={(e) => setIsCourse(e.target.checked)} />
        Make this a <strong>course</strong> (ordered — learners get the next video automatically)
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        Public (others can discover it on the Courses page)
      </label>
      {error && <p className="meta text-accent2">{error}</p>}
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="px-5 py-2 border-2 border-line rounded-full bg-accent text-on-accent text-sm font-bold disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create & add videos'}
      </button>
    </form>
  )
}
