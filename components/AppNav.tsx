'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Settings, WifiOff } from 'lucide-react'
import { signOutClient } from '@/lib/firebase/authClient'
import NotificationBell from '@/components/NotificationBell'
import { ThemeToggleButton } from '@/components/ThemeToggle'
import { Logo } from '@/components/Mascot'
import { useOnline } from '@/lib/offlineQueue'
import { HybridHudCard, HybridHudChip } from '@/components/HybridHud'

// Each section keeps its own dot colour everywhere it appears.
// `net: true` = the destination needs the network (AI tutor, YouTube, fresh
// server data). Those are disabled/greyed while offline; Today stays available
// because flashcard review runs from the on-device cache.
export const NAV_LINKS = [
  { href: '/learn', label: 'Today', dot: 'var(--lime)', net: false },
  // The tutor chats on-device (Gemini Nano) when offline and syncs later, so it stays available.
  { href: '/chat', label: 'Tutor', dot: 'var(--purple)', net: false },
  // Sentence practice runs on-device (Gemini Nano), so it stays available offline.
  { href: '/sentences', label: 'Speak & write', dot: 'var(--orange)', net: false },
  { href: '/videos', label: 'Videos', dot: 'var(--sky)', net: true },
  { href: '/courses', label: 'Courses', dot: 'var(--yellow)', net: true },
  { href: '/progress', label: 'Progress', dot: 'var(--pink)', net: true },
  { href: '/league', label: 'League', dot: 'var(--lime)', net: true },
]

// Desktop: a white, outlined sidebar floating 16px in from the edge, with the
// learner's level card in yellow at the bottom. Mobile: a slim top bar with the
// logo and bell; navigation itself lives in <BottomNav />.
export default function AppNav({ name, level }: { name: string; level?: string | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const online = useOnline()

  async function signOut() {
    await signOutClient()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 pt-safe bg-paper/95 backdrop-blur border-b-[2.5px] border-line">
        <div className="px-4 h-(--nav-h) flex items-center justify-between gap-3">
          <Link href="/learn" aria-label="Langi, Today"><Logo size={30} /></Link>
          <div className="flex items-center gap-2">
            {!online && <OfflineBadge />}
            <HybridHudChip />
            {level && (
              <Link href="/placement" className="chip bg-yellow text-on-bright border-[var(--shadow-ink)]">{level}</Link>
            )}
            <NotificationBell />
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed z-30 top-4 bottom-4 left-4 w-(--sidebar-w) flex-col gap-6 p-4 bg-paper-raised border-[2.5px] border-line rounded-[32px]"
        aria-label="Sidebar"
      >
        <Link href="/learn" className="px-2 pt-1" aria-label="Langi, Today"><Logo /></Link>

        <nav className="flex flex-col gap-1.5 overflow-y-auto -mx-1 px-1" aria-label="Primary">
          {NAV_LINKS.map(({ href, label, dot, net }) => {
            const active = isActive(href)
            if (net && !online) {
              return (
                <span key={href} className="nav-pill" aria-disabled="true" title="Needs an internet connection">
                  <span className="nav-dot" style={{ background: dot }} />
                  {label}
                </span>
              )
            }
            return (
              <Link key={href} href={href} className="nav-pill" aria-current={active ? 'page' : undefined}>
                {/* On the purple active pill, a purple dot would vanish: swap to lime. */}
                <span className="nav-dot" style={{ background: active && dot === 'var(--purple)' ? 'var(--lime)' : dot }} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {!online && <OfflineBadge />}
          <HybridHudCard />
          <Link
            href="/placement"
            className="block p-4 rounded-[22px] bg-yellow text-on-bright border-[2.5px] border-[var(--shadow-ink)] shadow-(--shadow-sm) hover:-translate-y-0.5 transition-transform"
          >
            <span className="block text-[0.8rem] font-bold">Your level</span>
            <span className="block display text-3xl mt-0.5">{level || 'Not placed'}</span>
            <span className="block text-sm font-semibold mt-1 truncate">{name}</span>
          </Link>
          <div className="flex items-center justify-between">
            <NotificationBell placement="up" />
            <ThemeToggleButton />
            <Link href="/settings" className="circle-arrow w-11 h-11 hover:bg-paper-dark" aria-label="Settings"
              aria-current={isActive('/settings') ? 'page' : undefined}>
              <Settings className="w-[18px] h-[18px]" strokeWidth={2.4} />
            </Link>
            <button onClick={signOut} className="circle-arrow w-11 h-11 hover:bg-paper-dark cursor-pointer" aria-label="Sign out">
              <LogOut className="w-[18px] h-[18px]" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

function OfflineBadge() {
  return (
    <span className="chip bg-paper-dark" title="You're offline. Review still works.">
      <WifiOff className="w-3.5 h-3.5" strokeWidth={2.4} /> Offline
    </span>
  )
}
