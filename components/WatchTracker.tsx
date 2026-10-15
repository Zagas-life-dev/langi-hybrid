'use client'
import { useEffect } from 'react'

// Fire-and-forget: records that the user opened this video (watch history →
// repetition control + Continue watching + first-watch streak/XP). Renders
// nothing. Runs once per mount.
export default function WatchTracker({ videoId, playlistId }: { videoId: string; playlistId?: string }) {
  useEffect(() => {
    fetch(`/api/videos/${videoId}/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId }),
    }).catch(() => {})
  }, [videoId, playlistId])
  return null
}
