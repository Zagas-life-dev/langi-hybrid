import Link from 'next/link'
import { ArrowRight, ArrowUp, ArrowDown } from 'lucide-react'
import { getUser } from '@/lib/auth'
import Mascot, { Logo } from '@/components/Mascot'

export const dynamic = 'force-dynamic'

const FEATURES = [
  {
    title: 'Spaced repetition',
    body: 'Type the translation and your word climbs a box. Five boxes, and each one comes back less often.',
    bg: 'bg-pink',
    demo: 'boxes',
  },
  {
    title: 'Meet Langi, your tutor',
    body: 'Ask for examples, get quick drills, or just chat in French about a random topic. Powered by Mistral and Gemini.',
    bg: 'bg-purple-soft',
    demo: 'chat',
  },
  {
    title: 'Speak & listen',
    body: 'Hear how a native says it, then say it back into your mic. Right in the browser.',
    bg: 'bg-lime',
    demo: null,
  },
  {
    title: 'Videos worth watching',
    body: 'A hand-picked feed, from easy immersion to proper classes, sorted by level.',
    bg: 'bg-sky',
    demo: null,
  },
] as const

// Box colours climb in order: the same five fills the flashcards use.
const STEPS = [
  { box: 1, label: 'New', bg: 'bg-pink', h: 'h-24' },
  { box: 2, label: 'Sticking', bg: 'bg-orange', h: 'h-36' },
  { box: 3, label: 'Getting there', bg: 'bg-yellow', h: 'h-48' },
  { box: 4, label: 'Almost', bg: 'bg-lime', h: 'h-60' },
  { box: 5, label: 'Know it cold', bg: 'bg-sky', h: 'h-72' },
]

export default async function LandingPage() {
  const user = await getUser()
  const cta = user ? '/learn' : '/signup'
  const ctaLabel = user ? 'Continue learning' : 'Start learning free'

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <header className="max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-4">
        <Link href="/" aria-label="Langi home"><Logo /></Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a href="#how" className="hidden md:inline-flex px-4 font-bold hover:text-accent">How it works</a>
          <a href="#placement" className="hidden md:inline-flex px-4 font-bold hover:text-accent">Placement test</a>
          {user ? (
            <Link href="/learn" className="btn-ink">Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
              <Link href="/signup" className="btn-ink">Sign up</Link>
            </>
          )}
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-20 grid lg:grid-cols-[1.25fr_1fr] gap-12 items-center">
          <div>
            <span className="sticker sticker-lime mb-7">Bonjour ! French, but it sticks</span>
            <h1 className="display text-[clamp(3.2rem,7.4vw,6.75rem)] leading-[0.95] tracking-[-0.045em] mb-7">
              Learn French.<br />
              Actually <span className="hl">remember</span> it.
            </h1>
            <p className="text-lg sm:text-xl text-ink-soft max-w-xl leading-relaxed mb-9 font-normal">
              Flashcards that know when you&apos;re about to forget, plus Langi, a chatty AI tutor who only
              speaks French. Learn a word today, use it this weekend.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href={cta} className="btn-ink min-h-[3.9rem] px-8 text-lg">
                {ctaLabel} <ArrowRight className="w-5 h-5" strokeWidth={2.6} />
              </Link>
              <span className="chip">Placement test included</span>
            </div>
          </div>

          {/* Floating word cards around the mascot */}
          <div className="relative h-[380px] sm:h-[440px] hidden sm:block" aria-hidden="true">
            <div className="absolute inset-x-8 top-8 bottom-8 rounded-[48px] bg-yellow border-[2.5px] border-[var(--shadow-ink)]" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Mascot size={210} />
            </div>
            <WordCard fr="bonjour" en="hello" className="left-0 top-2 bg-paper-raised rotate-[-8deg]" />
            <WordCard fr="se souvenir" en="to remember" className="right-0 top-24 bg-pink text-on-bright rotate-[7deg]" />
            <WordCard fr="la boulangerie" en="bakery" className="left-6 bottom-2 bg-sky text-on-bright rotate-[4deg]" />
          </div>
        </section>

        {/* Features */}
        <section id="how" className="max-w-[1280px] mx-auto px-4 sm:px-6 pb-24 scroll-mt-6">
          <h2 className="display text-[clamp(2.4rem,5vw,4.5rem)] tracking-[-0.04em] max-w-3xl mb-10">
            Four ways Langi gets French into your head.
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <article key={f.title}
                className={`${f.bg} text-on-bright rounded-[40px] border-[2.5px] border-[var(--shadow-ink)] shadow-(--shadow-lg) p-8 sm:p-10 flex flex-col gap-4 min-h-[300px]`}>
                <h3 className="display text-3xl sm:text-[2.6rem] tracking-[-0.03em]">{f.title}</h3>
                <p className="text-lg leading-relaxed max-w-md">{f.body}</p>
                {f.demo === 'boxes' && (
                  <div className="mt-auto flex items-end gap-2" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n}
                        className="w-12 rounded-[14px] bg-paper-raised text-ink border-[2.5px] border-[var(--shadow-ink)] flex items-center justify-center display text-xl"
                        style={{ height: 32 + n * 14 }}>{n}</span>
                    ))}
                  </div>
                )}
                {f.demo === 'chat' && (
                  <div className="mt-auto flex flex-col gap-2" aria-hidden="true">
                    <span className="bubble bubble-langi bg-white">Tu fais quoi ce week-end ?</span>
                    <span className="bubble bubble-me">Je vais au marché !</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* Ink section: staircase, placement, CTA */}
        <section className="bg-[#1b1530] text-white rounded-t-[56px] border-t-[2.5px] border-x-[2.5px] border-line pt-24 pb-16">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-14 items-end mb-28">
              <div>
                <h2 className="display text-[clamp(2.6rem,5.5vw,4.5rem)] tracking-[-0.04em] mb-6">
                  Every word climbs<br />five steps.
                </h2>
                <p className="text-lg leading-relaxed text-[#d6d1e6] max-w-lg mb-8">
                  It&apos;s the Leitner system. Get a word right and it moves up a box. Slip up and it slides back
                  down, so you see it again sooner. Easy words get out of your way.
                </p>
                <ul className="flex flex-col gap-3 font-bold">
                  <li className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-lime text-on-bright border-[2.5px] border-white flex items-center justify-center"><ArrowUp className="w-4 h-4" strokeWidth={3} /></span>
                    Right answer: up a box
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-pink text-on-bright border-[2.5px] border-white flex items-center justify-center"><ArrowDown className="w-4 h-4" strokeWidth={3} /></span>
                    Slip up: back down it goes
                  </li>
                </ul>
              </div>
              <ol className="flex items-end gap-2 sm:gap-3" aria-label="The five Leitner boxes">
                {STEPS.map((s) => (
                  <li key={s.box}
                    className={`${s.bg} ${s.h} flex-1 text-on-bright rounded-[18px] border-[2.5px] border-white p-2 sm:p-3 flex flex-col justify-between`}>
                    <span className="display text-3xl sm:text-4xl">{s.box}</span>
                    <span className="text-[0.7rem] sm:text-xs font-extrabold leading-tight">{s.label}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div id="placement" className="bg-yellow text-on-bright rounded-[40px] border-[2.5px] border-white p-8 sm:p-14 grid md:grid-cols-[1fr_auto] gap-8 items-center mb-8 scroll-mt-6">
              <div>
                <h2 className="display text-[clamp(2.2rem,4.5vw,3.6rem)] tracking-[-0.04em] mb-4">Skip what you already know.</h2>
                <p className="text-lg leading-relaxed max-w-xl">
                  A quick vocabulary placement test finds your level, A1 to C2, so day one starts in the right place.
                </p>
              </div>
              <span className="w-36 h-36 rounded-full bg-paper-raised text-ink border-[2.5px] border-[var(--shadow-ink)] shadow-(--shadow-md) flex items-center justify-center display text-3xl rotate-[-12deg] justify-self-center">
                A1 → C2
              </span>
            </div>

            <div className="bg-purple rounded-[40px] border-[2.5px] border-white p-8 sm:p-14 flex flex-col md:flex-row items-center gap-10">
              <Mascot variant="yellow" size={170} className="shrink-0" />
              <div className="flex-1 text-center md:text-left">
                <h2 className="display text-[clamp(2.2rem,4.5vw,3.6rem)] tracking-[-0.04em] mb-6">
                  Your first words are one sign-up away.
                </h2>
                <Link href={cta} className="btn-lime min-h-[3.9rem] px-8 text-lg">
                  {ctaLabel} <ArrowRight className="w-5 h-5" strokeWidth={2.6} />
                </Link>
              </div>
            </div>
          </div>

          <footer className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-16 flex flex-wrap items-center justify-between gap-4 text-[#d6d1e6] font-semibold text-sm">
            <span className="flex items-center gap-2 text-white"><Mascot variant="mark" size={28} /><span className="display text-xl">langi</span></span>
            Built on the Scrappey auth + AI stack.
          </footer>
        </section>
      </main>
    </div>
  )
}

function WordCard({ fr, en, className }: { fr: string; en: string; className: string }) {
  return (
    <div className={`absolute px-5 py-3.5 rounded-[22px] border-[2.5px] border-[var(--shadow-ink)] shadow-(--shadow-md) ${className}`}>
      <p className="display text-2xl">{fr}</p>
      <p className="text-sm font-semibold opacity-80">{en}</p>
    </div>
  )
}
