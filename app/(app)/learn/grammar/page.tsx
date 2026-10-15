import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import GrammarProgress from '@/lib/models/GrammarProgress'
import { getCatalog, unlockedLevels } from '@/lib/grammar'
import { countDueGrammarQuestions } from '@/lib/grammar-practice'
import { CEFR_LEVELS } from '@/lib/models/LangiUser'
import { Lock, Check, BookOpen, Dumbbell, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function GrammarIndexPage() {
  const { dbUser } = await requireUser()
  const lang = dbUser.learningLang

  await connectDB()
  const [progress, practiceDue] = await Promise.all([
    GrammarProgress.find({ userId: dbUser._id, languageCode: lang }).lean(),
    countDueGrammarQuestions(dbUser._id, lang, dbUser.cefrLevel),
  ])
  const progBySlug = new Map(progress.map((p) => [p.lessonSlug, p]))
  const unlocked = unlockedLevels(dbUser.cefrLevel)

  const catalog = getCatalog(lang)
  const byLevel: Record<string, typeof catalog> = {}
  for (const t of catalog) (byLevel[t.level] ||= []).push(t)
  const levels = CEFR_LEVELS.filter((l) => byLevel[l])

  const doneCount = progress.filter((p) => p.completed).length

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-2">
        <p className="meta text-muted">Grammar</p>
        <p className="meta text-muted">{doneCount} / {catalog.length} done</p>
      </div>
      <h1 className="display font-display text-4xl sm:text-5xl mb-3">Grammar lessons</h1>
      <p className="text-muted mb-8 max-w-xl">
        Bite-size lessons with conjugation drills, tuned to your level. Missed drills go straight to your{' '}
        <Link href="/learn/mistakes" className="text-accent hover:underline">Mistakes deck</Link>.
      </p>

      {/* Concept practice — spaced-repetition MCQs on grammar you've covered */}
      <Link href="/learn/grammar/practice" className="brut-card flex items-center justify-between gap-4 p-5 mb-10 bg-accent text-on-accent border-accent">
        <div className="flex items-center gap-3">
          <Dumbbell className="w-5 h-5" strokeWidth={2.2} />
          <div>
            <p className="font-medium">Practice grammar concepts</p>
            <p className="text-sm opacity-90">
              {practiceDue > 0
                ? `${practiceDue} question${practiceDue === 1 ? '' : 's'} ready — spaced-repetition quiz on what you've covered.`
                : 'Quiz yourself on the grammar concepts you’ve covered.'}
            </p>
          </div>
        </div>
        {practiceDue > 0 ? <span className="chip bg-paper text-accent border-paper whitespace-nowrap">{practiceDue} due</span> : <ArrowRight className="w-5 h-5" strokeWidth={2.2} />}
      </Link>

      {levels.map((level) => {
        const isUnlocked = unlocked.has(level)
        return (
          <div key={level} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="chip">{level}</span>
              {!isUnlocked && <span className="meta text-muted flex items-center gap-1"><Lock className="w-3 h-3" /> reach this level to unlock</span>}
              <div className="flex-1 h-px bg-ink/20" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {byLevel[level].map((t) => {
                const p = progBySlug.get(t.slug)
                const done = p?.completed
                if (!isUnlocked) {
                  return (
                    <div key={t.slug} className="brut-card p-5 flex items-start justify-between gap-3 opacity-50">
                      <div className="flex items-start gap-3">
                        <Lock className="w-5 h-5 mt-0.5 text-muted" strokeWidth={2.2} />
                        <p className="font-medium">{t.title}</p>
                      </div>
                    </div>
                  )
                }
                return (
                  <Link key={t.slug} href={`/learn/grammar/${t.slug}`} className="brut-card p-5 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <BookOpen className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
                      <div>
                        <p className="font-medium">{t.title}</p>
                        {done && <p className="meta text-muted mt-1">Best {p?.bestScore ?? 0}%</p>}
                      </div>
                    </div>
                    {done && <Check className="w-5 h-5 text-ok shrink-0" strokeWidth={2} />}
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
