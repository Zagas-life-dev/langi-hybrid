import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AppNav from '@/components/AppNav'
import BottomNav from '@/components/BottomNav'
import InstallPrompt from '@/components/InstallPrompt'
import OfflineVoicePrompt from '@/components/OfflineVoicePrompt'
import OfflineWarmer from '@/components/OfflineWarmer'
import { LangProvider } from '@/components/LangProvider'
import DeviceBanner from '@/components/DeviceBanner'
import RemoteRouting from '@/components/RemoteRouting'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Stop Chrome/Google Translate from auto-translating the learning area — the
// French content MUST stay French (a translated "je suis" → "I am" defeats the
// whole point). Scoped to the in-app routes so the public landing page can still
// be translated for prospective non-English learners.
export const metadata: Metadata = {
  other: { google: 'notranslate' },
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let name = ''
  let level: string | null | undefined
  let learningLang = 'fr'
  let nativeLang = 'en'
  let ttsVoice: string | undefined
  try {
    const { supabaseUser, dbUser } = await requireUser()
    name = dbUser.displayName || supabaseUser.email?.split('@')[0] || 'Learner'
    level = dbUser.cefrLevel
    learningLang = dbUser.learningLang || 'fr'
    nativeLang = dbUser.nativeLang || 'en'
    ttsVoice = dbUser.ttsVoice
  } catch {
    redirect('/login?reauth=1')
  }

  return (
    // translate="no" tells the browser to skip this subtree when translating, a
    // second line of defence alongside the page-level notranslate meta above.
    <LangProvider learningLang={learningLang} nativeLang={nativeLang} ttsVoice={ttsVoice}>
      <div className="min-h-screen flex flex-col" translate="no">
        {/* First tab stop: lets keyboard and screen-reader users jump the nav. */}
        <a href="#main" className="sr-only focusable-sr">Skip to content</a>
        <AppNav name={name} level={level} />
        {/* pb-nav reserves room for the mobile tab bar (no-ops from md up). */}
        {/* From md up the content sits to the right of the floating sidebar. */}
        <main id="main" tabIndex={-1} className="flex-1 pb-nav focus-none md:pl-[calc(var(--sidebar-w)+2rem)] md:pr-4 md:py-4"><DeviceBanner />{children}</main>
        <BottomNav />
        <OfflineWarmer />
        <RemoteRouting />
        <InstallPrompt />
        <OfflineVoicePrompt />
      </div>
    </LangProvider>
  )
}
