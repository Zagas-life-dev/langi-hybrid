import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import Deck from '@/lib/models/Deck'
import Mistake from '@/lib/models/Mistake'
import { deckDueCounts, boxDistribution } from '@/lib/srs'
import { countDueGrammarQuestions } from '@/lib/grammar-practice'
import { getTodayActivity } from '@/lib/activity'
import { nextLevel } from '@/lib/levelUpCore'
import GoalOnboarding from '@/components/GoalOnboarding'
import Mascot from '@/components/Mascot'
import BoxTiles from '@/components/BoxTiles'
import {
  ArrowRight, Flame, Sparkles, AlertCircle, BookOpen, ScrollText, Headphones, MessageSquare, Layers, Trophy, Star,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

// Localized greeting so the dashboard speaks the language you're learning.
// French keeps its space before "!".
const GREETING: Record<string, string> = { fr: 'Salut', es: '¡Hola', de: 'Hallo', it: 'Ciao', pt: 'Olá' }
const BANG: Record<string, string> = { fr: ' !', es: '!', de: '!', it: '!', pt: '!' }
const LOCALE: Record<string, string> = { fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT', pt: 'pt-PT' }

// About 20 seconds a card, rounded up to whole minutes.
const minutesFor = (cards: number) => Math.max(1, Math.ceil((cards * 20) / 60))

export default async function LearnPage() {
  const { supabaseUser, dbUser } = await requireUser()
  const name = dbUser.displayName || supabaseUser.email?.split('@')[0] || 'Learner'
  const lang = dbUser.learningLang
  const greeting = `${GREETING[lang] || 'Hello'}, ${name}${BANG[lang] || '!'}`
  const date = new Intl.DateTimeFormat(LOCALE[lang] || 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  const decks = await Deck.find({ languageCode: lang }).sort({ order: 1 }).lean()
  const [dueCounts, dist, today, mistakesDue, grammarDue] = await Promise.all([
    deckDueCounts(String(dbUser._id), lang),
    boxDistribution(String(dbUser._id), lang),
    getTodayActivity(String(dbUser._id), dbUser.dailyGoal || 20),
    Mistake.countDocuments({ userId: dbUser._id, resolved: false, dueAt: { $lte: new Date() } }),
    countDueGrammarQuestions(dbUser._id, lang, dbUser.cefrLevel),
  ])

  const totalDue = Object.values(dueCounts).reduce((a, b) => a + b, 0)
  const byLevel: Record<string, typeof decks> = {}
  for (const d of decks) (byLevel[d.level] ||= []).push(d)
  const levels = Object.keys(byLevel).sort()
  const streak = dbUser.streak || 0
  const goalPct = today.goal > 0 ? Math.min(100, Math.round((today.goalProgress / today.goal) * 100)) : 0
  const dueBoxes = [1, 2, 3, 4, 5].filter((b) => dist.dueByBox[b] > 0)
  const boxRange = dueBoxes.length === 0 ? 'New words'
    : dueBoxes.length === 1 ? `Box ${dueBoxes[0]}`
    : `Boxes ${dueBoxes[0]} to ${dueBoxes[dueBoxes.length - 1]}`
  const next = dbUser.cefrLevel ? nextLevel(dbUser.cefrLevel) : null

  const plan: PlanItem[] = [
    {
      href: '/learn/review/all', icon: Layers, bg: 'bg-pink',
      title: totalDue > 0 ? `Review ${totalDue} words` : 'Learn new words',
      meta: totalDue > 0 ? `${boxRange} · about ${minutesFor(totalDue)} min` : 'Start a deck below',
      badge: totalDue > 0 ? `${totalDue} due` : null,
    },
    { href: '/chat', icon: MessageSquare, bg: 'bg-purple-soft', title: 'Chat with Langi', meta: 'A random topic, French only · about 5 min', badge: null },
    {
      href: '/learn/mistakes', icon: AlertCircle, bg: 'bg-orange', title: 'Fix your slip-ups',
      meta: 'Sentences and corrections you got wrong', badge: mistakesDue > 0 ? `${mistakesDue} due` : null,
    },
    {
      href: '/learn/grammar', icon: BookOpen, bg: 'bg-yellow', title: 'Grammar',
      meta: 'Lessons, conjugation drills and quizzes', badge: grammarDue > 0 ? `${grammarDue} to quiz` : null,
    },
    { href: '/learn/stories', icon: ScrollText, bg: 'bg-sky', title: 'Read a story', meta: 'Graded, with tap-to-translate', badge: null },
    { href: '/learn/dictation', icon: Headphones, bg: 'bg-lime', title: 'Dictation', meta: 'Listen and type what you hear', badge: null },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-9">
      {/* Greeting */}
      <span className="sticker sticker-lime mb-4 first-letter:uppercase">{date}</span>
      <h1 className="display text-[clamp(2.6rem,6vw,4rem)] tracking-[-0.045em] mb-7 wrap-break-word">{greeting}</h1>

      {!dbUser.cefrLevel && (
        <Link href="/placement"
          className="fill-card bg-yellow flex items-center justify-between gap-4 p-5 sm:p-6 mb-7 hover:-translate-y-0.5 transition-transform">
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-[14px] bg-white border-[2.5px] border-[var(--shadow-ink)] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" strokeWidth={2.4} />
            </span>
            <div>
              <p className="display text-2xl">Take the placement test</p>
              <p className="font-semibold">Find your level, A1 to C2, and start at the right decks.</p>
            </div>
          </div>
          <ArrowRight className="w-6 h-6 shrink-0" strokeWidth={2.6} />
        </Link>
      )}

      {!dbUser.dailyGoalChosen && <GoalOnboarding />}

      <div className="flex flex-col gap-6 mb-10">
        {/* The big purple moment: what's waiting tonight, streak, goal. */}
        <section className="fill-card-purple relative overflow-hidden p-7 sm:p-9 flex flex-col gap-6">
          <Mascot variant="yellow" size={150} className="absolute right-6 bottom-5 rotate-[-8deg] hidden md:block" />
          <div className="flex flex-wrap gap-2">
            <span className="chip bg-yellow text-on-bright border-[var(--shadow-ink)]">
              <Flame className="w-4 h-4" strokeWidth={2.6} /> {streak}-day streak
            </span>
            <span className="chip bg-white text-on-bright border-[var(--shadow-ink)]">
              <Star className="w-4 h-4" strokeWidth={2.6} /> {dbUser.xp || 0} XP
            </span>
          </div>
          <div className="md:pr-44 max-w-3xl">
            <p className="display text-3xl sm:text-[2.6rem] leading-[1.05] tracking-[-0.03em] mb-2">
              {today.goalMet
                ? 'Goal done. Bravo !'
                : totalDue > 0
                  ? `${totalDue} words want to see you tonight.`
                  : 'All caught up. Time for new words?'}
            </p>
            <p className="text-[#ede6ff] font-semibold">
              {today.goalMet
                ? `${today.goalProgress} cards today. Anything more puts you ahead for tomorrow.`
                : streak > 0
                  ? `${today.goal - today.goalProgress} more cards to keep your ${streak}-day streak going.`
                  : `${today.goal} cards a day starts your streak.`}
            </p>
          </div>
          <div className="mt-auto flex flex-col sm:flex-row sm:items-center gap-5 md:pr-44">
            <Link href="/learn/review/all" className="btn-lime min-h-[3.5rem] text-lg px-7 shrink-0">
              {totalDue > 0 ? "Let's review" : 'Start new words'} <ArrowRight className="w-5 h-5" strokeWidth={2.6} />
            </Link>
            <div className="flex-1 min-w-0 max-w-md">
              <div className="flex justify-between text-sm font-bold mb-1.5">
                <span>Daily goal</span>
                <span>{today.goalProgress} / {today.goal}</span>
              </div>
              <div className="progress-pill border-[var(--shadow-ink)]" role="progressbar"
                aria-valuemin={0} aria-valuemax={today.goal} aria-valuenow={today.goalProgress} aria-label="Daily goal">
                <span style={{ width: `${goalPct}%` }} />
              </div>
            </div>
          </div>
        </section>

        {/* Tonight's plan */}
        <section className="brut-card p-5 sm:p-6">
          <h2 className="display text-2xl mb-4 px-1">Tonight&apos;s plan</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {plan.map((item) => <PlanRow key={item.href} {...item} />)}
          </ul>
        </section>
      </div>

      {/* Your five boxes */}
      <section className="mb-12">
        <div className="flex items-end justify-between flex-wrap gap-2 mb-4">
          <h2 className="display text-3xl tracking-[-0.03em]">Your five boxes</h2>
          <span className="meta text-muted">
            {dist.seen} words in rotation{dist.newCount > 0 ? ` · ${dist.newCount} still new` : ''}
          </span>
        </div>
        <BoxTiles boxes={dist.boxes} dueByBox={dist.dueByBox} />
      </section>

      {/* Level + decks */}
      {dbUser.cefrLevel && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="chip bg-yellow text-on-bright border-[var(--shadow-ink)]"><Trophy className="w-4 h-4" strokeWidth={2.4} /> Level {dbUser.cefrLevel}</span>
          <Link href="/placement" className="meta text-muted hover:text-accent">Retake placement</Link>
          {next && <Link href="/learn/level-up" className="meta text-accent hover:underline">Level up to {next} →</Link>}
        </div>
      )}

      {levels.map((level) => (
        <section key={level} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="display text-2xl">{level} decks</h2>
            <div className="flex-1 h-[2.5px] rounded-full bg-line/30" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {byLevel[level].map((deck) => {
              const due = dueCounts[String(deck._id)] || 0
              return (
                <Link key={String(deck._id)} href={`/learn/review/${String(deck._id)}`}
                  className="brut-card p-5 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="display text-xl leading-tight">{deck.title}</p>
                    {due > 0
                      ? <span className="shrink-0 rounded-full bg-[#1b1530] text-white text-xs font-extrabold px-2.5 py-1">{due} due</span>
                      : <span className="shrink-0 rounded-full bg-lime text-on-bright border-2 border-[var(--shadow-ink)] text-xs font-extrabold px-2.5 py-0.5">Done</span>}
                  </div>
                  <p className="text-sm text-muted leading-snug">{deck.description}</p>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

interface PlanItem {
  href: string
  icon: typeof Layers
  bg: string
  title: string
  meta: string
  badge: string | null
}

function PlanRow({ href, icon: Icon, bg, title, meta, badge }: PlanItem) {
  return (
    <li>
      <Link href={href}
        className="flex items-center gap-3.5 p-2.5 pr-3.5 rounded-[22px] bg-paper border-[2.5px] border-transparent hover:border-line transition-colors">
        <span className={`${bg} text-on-bright w-12 h-12 rounded-[14px] border-[2.5px] border-[var(--shadow-ink)] flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5" strokeWidth={2.4} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-extrabold leading-tight">{title}</span>
          <span className="block text-sm font-semibold text-muted truncate">{meta}</span>
        </span>
        {badge && <span className="shrink-0 rounded-full bg-[#1b1530] text-white text-xs font-extrabold px-2.5 py-1">{badge}</span>}
      </Link>
    </li>
  )
}
