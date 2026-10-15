'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

// Pulls a fresh batch of profile-matched videos from YouTube (bypassing the
// search cache), then re-renders the page so the feed reshuffles with them.
export default function RefreshFeedButton() {
  const router = useRouter()
  const [fetching, setFetching] = useState(false)
  const [pending, startTransition] = useTransition()
  const busy = fetching || pending

  async function refresh() {
    setFetching(true)
    try {
      await fetch('/api/foryou?refresh=1')
    } catch {
      /* the reshuffle below still varies the feed */
    }
    setFetching(false)
    startTransition(() => router.refresh())
  }

  return (
    <button
      onClick={refresh}
      disabled={busy}
      className="chip shrink-0 py-1.5! px-4! text-sm hover:bg-accent-soft disabled:opacity-60"
    >
      <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} strokeWidth={2.4} />
      {busy ? 'Refreshing…' : 'Refresh'}
    </button>
  )
}
