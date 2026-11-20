'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  GraduationCap, MessageSquare, Video, BarChart3, MoreHorizontal,
  PenLine, ListVideo, Settings, LogOut, X, WifiOff, Sun, Moon, Monitor, Trophy,
} from 'lucide-react'
import { signOutClient } from '@/lib/firebase/authClient'
import { useOnline } from '@/lib/offlineQueue'
import { useTheme, type ThemeChoice } from '@/components/ThemeProvider'

// Four primary destinations + More. Kept to five so tap targets stay ~20% of
// viewport width each — anything more and thumbs start mis-hitting.
// `net: true` = needs a connection (greyed while offline, matching AppNav).
const PRIMARY = [
  { href: '/learn', label: 'Today', icon: GraduationCap, net: false },
  // The tutor and sentence practice run on-device (Gemini Nano), so they stay available offline.
  { href: '/chat', label: 'Tutor', icon: MessageSquare, net: false },
  { href: '/videos', label: 'Videos', icon: Video, net: true },
  { href: '/progress', label: 'Progress', icon: BarChart3, net: true },
]

const SECONDARY = [
  { href: '/sentences', label: 'Speak & write', icon: PenLine, net: false },
  { href: '/courses', label: 'Courses', icon: ListVideo, net: true },
  { href: '/learn/stories', label: 'Stories', icon: GraduationCap, net: true },
  { href: '/league', label: 'League', icon: Trophy, net: true },
  { href: '/settings', label: 'Settings', icon: Settings, net: false },
]

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const online = useOnline()
  const [sheet, setSheet] = useState(false)
  const { theme, setTheme } = useTheme()

  // Close the sheet on navigation so it never lingers over the new page.
  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => { setSheet(false) }, [pathname])

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    if (!sheet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [sheet])

  // Escape closes the sheet — expected of any modal surface.
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  async function signOut() {
    await signOutClient()
    router.push('/login')
    router.refresh()
  }

  const inMore = SECONDARY.some((l) => isActive(l.href))

  return (
    <>
      <nav className="tab-bar md:hidden" aria-label="Primary">
        {PRIMARY.map(({ href, label, icon: Icon, net }) => {
          const blocked = net && !online
          if (blocked) {
            return (
              <span key={href} className="tab-item" aria-disabled="true" title="Needs an internet connection">
                <Icon className="w-5 h-5" strokeWidth={2.2} />
                {label}
              </span>
            )
          }
          return (
            <Link key={href} href={href} className="tab-item" data-active={isActive(href)}
              aria-current={isActive(href) ? 'page' : undefined}>
              <Icon className="w-5 h-5" strokeWidth={2.4} />
              {label}
            </Link>
          )
        })}
        <button
          onClick={() => setSheet(true)}
          className="tab-item"
          data-active={inMore || sheet}
          aria-expanded={sheet}
          aria-haspopup="dialog"
        >
          <MoreHorizontal className="w-5 h-5" strokeWidth={2.4} />
          More
        </button>
      </nav>

      {/* "More" sheet: the overflow destinations plus account + theme controls,
          which have nowhere else to live on mobile now the hamburger is gone. */}
      {sheet && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More options">
          <button
            className="absolute inset-0 bg-[#1b1530]/55 focus-none"
            onClick={() => setSheet(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-paper border-t-[2.5px] border-x-[2.5px] border-line rounded-t-[32px] pb-safe animate-[card-in_var(--dur-slow)_var(--ease)]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="display text-2xl">More</span>
              <button onClick={() => setSheet(false)} className="circle-arrow w-11 h-11" aria-label="Close">
                <X className="w-[18px] h-[18px]" strokeWidth={2.4} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 px-4">
              {SECONDARY.map(({ href, label, icon: Icon, net }) => {
                const blocked = net && !online
                if (blocked) {
                  return (
                    <span key={href} aria-disabled="true"
                      className="flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-[20px] border-[2.5px] border-line bg-paper-raised text-muted opacity-40">
                      <Icon className="w-[18px] h-[18px]" strokeWidth={2.4} />
                      {label}
                      <WifiOff className="w-3.5 h-3.5 ml-auto" strokeWidth={1.5} />
                    </span>
                  )
                }
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 px-4 py-3.5 text-sm font-bold rounded-[20px] border-[2.5px] ${isActive(href) ? 'bg-purple text-on-purple border-[var(--shadow-ink)]' : 'bg-paper-raised border-line'}`}>
                    <Icon className="w-[18px] h-[18px]" strokeWidth={2.4} />
                    {label}
                  </Link>
                )
              })}
            </div>

            <div className="px-4 pt-5 pb-2">
              <p className="meta text-muted mb-2">Theme</p>
              <div className="segmented w-full" role="radiogroup" aria-label="Colour theme">
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <button key={value} role="radio" aria-checked={theme === value}
                    onClick={() => setTheme(value)}
                    className="flex-1 flex items-center justify-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={signOut}
              className="mx-4 my-3 w-[calc(100%-2rem)] btn-ghost">
              <LogOut className="w-[18px] h-[18px]" strokeWidth={2.4} /> Sign out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
