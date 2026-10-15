'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
type Resolved = 'light' | 'dark'

export const THEME_KEY = 'langi-theme'

// Kept in sync with --paper in globals.css. Drives the mobile browser chrome
// (address bar / status bar) so it doesn't stay cream-white behind a dark app.
const BAR_COLOR: Record<Resolved, string> = { light: '#fff7ea', dark: '#16112a' }

interface ThemeCtx {
  /** What the user picked — may be 'system'. */
  theme: ThemeChoice
  /** What's actually on screen right now. */
  resolved: Resolved
  setTheme: (t: ThemeChoice) => void
  /** Convenience for a two-state toggle: flips to the opposite of what's shown. */
  toggle: () => void
}

const Ctx = createContext<ThemeCtx | null>(null)

// Inert context used when no provider is mounted — see useTheme() below for why
// that case degrades instead of throwing.
const FALLBACK: ThemeCtx = {
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
  toggle: () => {},
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Applies the choice to <html>.
 *
 * 'system' deliberately REMOVES the attribute rather than writing a resolved
 * value — globals.css keys its dark block off
 * `:root:not([data-theme="light"])` inside a prefers-color-scheme media query,
 * so an absent attribute lets the OS drive it live (including mid-session OS
 * theme changes) with no JS involved.
 */
function apply(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start at 'system' to match the server render; the real stored value is read
  // in the mount effect below. The inline script in app/layout.tsx has already
  // painted the correct colours, so this never flashes.
  const [theme, setThemeState] = useState<ThemeChoice>('system')
  const [resolved, setResolved] = useState<Resolved>('light')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let stored: ThemeChoice = 'system'
    try {
      const raw = localStorage.getItem(THEME_KEY)
      if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw
    } catch {
      // Private mode / storage blocked — fall back to following the OS.
    }
    setThemeState(stored)
    setResolved(stored === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : stored)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Track OS changes, but only while the user is actually on 'system'.
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setResolved(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  // Keep the browser chrome colour in step with whatever is rendered.
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = BAR_COLOR[resolved]
  }, [resolved])

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next)
    setResolved(next === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : next)
    apply(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  }, [])

  const toggle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setTheme])

  const value = useMemo(() => ({ theme, resolved, setTheme, toggle }), [theme, resolved, setTheme, toggle])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Deliberately does NOT throw when the provider is missing.
 *
 * It used to. That made a missing context fatal to every component that reads
 * it — including BottomNav, the *entire* mobile navigation. So any hiccup that
 * broke the provider (a transient compile error upstream poisoning the client
 * module graph, for one) took the whole mobile nav down with it, which is a
 * catastrophic failure for a cosmetic dependency.
 *
 * A theme toggle is not worth crashing navigation over. Without a provider we
 * return an inert light-theme context: the toggle becomes a no-op, everything
 * else renders normally.
 */
export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (ctx) return ctx
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[theme] useTheme() called outside <ThemeProvider> — falling back to light.')
  }
  return FALLBACK
}
