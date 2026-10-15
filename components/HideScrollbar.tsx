'use client'
import { useEffect } from 'react'

// Hides the window scrollbar while mounted (restores it on unmount). The Shorts
// page is sized to the viewport and the feed does its own snap-scrolling, so the
// outer page scrollbar is just visual noise here.
export default function HideScrollbar() {
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('no-scrollbar')
    return () => html.classList.remove('no-scrollbar')
  }, [])
  return null
}
