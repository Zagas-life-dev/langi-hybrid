import Link from 'next/link'
import { GraduationCap, Sparkles, Palette } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import SettingsForm from '@/components/SettingsForm'
import LanguageVoiceSettings from '@/components/LanguageVoiceSettings'
import MatureContentSettings from '@/components/MatureContentSettings'
import { ThemeSegmented } from '@/components/ThemeToggle'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { dbUser } = await requireUser()
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <p className="meta text-muted mb-2">Settings</p>
      <h1 className="display font-display text-4xl sm:text-5xl mb-8">Preferences</h1>
      <div className="space-y-8">
        {/* Appearance — stored per-device in localStorage, not on the account,
            so a shared login can be dark on a phone and light on a laptop. */}
        <section className="brut-card p-6">
          <div className="flex items-start gap-3 mb-5">
            <Palette className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
            <div>
              <h2 className="font-medium text-lg">Appearance</h2>
              <p className="text-sm text-muted">Choose a colour theme. &ldquo;System&rdquo; follows your device setting.</p>
            </div>
          </div>
          <ThemeSegmented />
        </section>

        <LanguageVoiceSettings />
        <MatureContentSettings
          initialBirthdate={dbUser.birthdate ? new Date(dbUser.birthdate).toISOString().slice(0, 10) : ''}
          initialMature={dbUser.matureContent ?? false}
        />
        <SettingsForm
          initial={{
            pushReminders: dbUser.pushReminders ?? true,
            reminderHour: dbUser.reminderHour ?? 19,
            dailyGoal: dbUser.dailyGoal ?? 20,
            displayName: dbUser.displayName ?? '',
          }}
        />
      </div>

      {/* Placement level */}
      <section className="brut-card p-6 mt-8">
        <div className="flex items-start gap-3 mb-5">
          <GraduationCap className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
          <div>
            <h2 className="font-medium text-lg">Placement level</h2>
            <p className="text-sm text-muted">Retake the test to re-estimate your grammar and vocabulary level.</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm">
            Current level:{' '}
            <span className="font-medium text-accent">{dbUser.cefrLevel || 'Not placed yet'}</span>
          </p>
          <Link href="/placement" className="btn-ghost">
            <Sparkles className="w-4 h-4" /> {dbUser.cefrLevel ? 'Retake placement test' : 'Take placement test'}
          </Link>
        </div>
      </section>
    </div>
  )
}
