import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { boxDistribution } from '@/lib/srs'
import ReviewLog from '@/lib/models/ReviewLog'
import SentenceAttempt from '@/lib/models/SentenceAttempt'
import { ACHIEVEMENTS } from '@/lib/achievements'
import MemoryStrength from '@/components/MemoryStrength'
import BoxTiles from '@/components/BoxTiles'
import { Flame, Trophy, Target, Sparkles, Star, Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Kept out of the component body so the render stays "pure" (no direct Date.now).
function weekAgoDate(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
}

export default async function ProgressPage() {
  const { dbUser } = await requireUser()
  const lang = dbUser.learningLang
  const userId = dbUser._id

  await connectDB()
  const weekAgo = weekAgoDate()
  const [dist, totalReviews, correctReviews, weekReviews, sentenceAgg] = await Promise.all([
    boxDistribution(String(userId), lang),
    ReviewLog.countDocuments({ userId }),
    ReviewLog.countDocuments({ userId, result: 'correct' }),
    ReviewLog.countDocuments({ userId, at: { $gte: weekAgo } }),
    SentenceAttempt.aggregate([
      { $match: { userId } },
      { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$score' } } },
    ]),
  ])

  const accuracy = totalReviews ? Math.round((correctReviews / totalReviews) * 100) : 0
  const sentenceCount = sentenceAgg[0]?.count ?? 0
  const sentenceAvg = sentenceAgg[0]?.avg ? Math.round(sentenceAgg[0].avg) : 0

  const unlockedMap = new Map((dbUser.achievements || []).map((a) => [a.id, a.unlockedAt]))
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlockedMap.has(a.id)).length

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <span className="sticker sticker-lime mb-4">Ça avance !</span>
      <h1 className="display text-[clamp(2.6rem,6vw,4rem)] tracking-[-0.045em] mb-8">Your progress</h1>

      {/* Level card */}
      <div className="fill-card bg-yellow p-6 sm:p-7 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <span className="w-24 h-24 rounded-full bg-white border-[2.5px] border-[var(--shadow-ink)] flex items-center justify-center display text-4xl rotate-[-8deg] shrink-0">{dbUser.cefrLevel || '?'}</span>
          <div>
            <p className="display text-2xl">CEFR level</p>
            <p className="font-semibold">
              {dbUser.placementTakenAt
                ? `Last tested ${new Date(dbUser.placementTakenAt).toLocaleDateString()}`
                : 'Not yet placed'}
            </p>
          </div>
        </div>
        <Link href="/placement" className="btn-ink">
          <Sparkles className="w-4 h-4" /> {dbUser.cefrLevel ? 'Retake test' : 'Take test'}
        </Link>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Stat bg="bg-orange" icon={<Flame className="w-5 h-5" strokeWidth={2.4} />} label="Day streak" value={String(dbUser.streak || 0)} />
        <Stat bg="bg-purple-soft" icon={<Trophy className="w-5 h-5" strokeWidth={2.4} />} label="Total XP" value={String(dbUser.xp || 0)} />
        <Stat bg="bg-lime" icon={<Target className="w-5 h-5" strokeWidth={2.4} />} label="Accuracy" value={`${accuracy}%`} />
        <Stat bg="bg-sky" icon={<Star className="w-5 h-5" strokeWidth={2.4} />} label="Know it cold" value={String(dist.mastered)} />
      </div>

      {/* Memory distribution */}
      <section className="mb-10">
        <div className="flex items-end justify-between flex-wrap gap-2 mb-4">
          <h2 className="display text-3xl tracking-[-0.03em]">Your five boxes</h2>
          <span className="meta text-muted">{dist.seen} of {dist.totalCards} words seen</span>
        </div>
        <BoxTiles boxes={dist.boxes} dueByBox={dist.dueByBox} />
        <div className="mt-6">
          <MemoryStrength dist={dist} label="Memory strength" />
        </div>
      </section>

      {/* Activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="brut-card p-5">
          <p className="display text-xl mb-3">Reviews</p>
          <p className="text-sm mb-1">Total: <span className="font-medium">{totalReviews}</span></p>
          <p className="text-sm mb-1">Correct: <span className="font-medium">{correctReviews}</span></p>
          <p className="text-sm">This week: <span className="font-medium">{weekReviews}</span></p>
        </div>
        <div className="brut-card p-5">
          <p className="display text-xl mb-3">Sentence practice</p>
          <p className="text-sm mb-1">Attempts: <span className="font-medium">{sentenceCount}</span></p>
          <p className="text-sm">Average score: <span className="font-medium">{sentenceCount ? `${sentenceAvg}/100` : '—'}</span></p>
        </div>
      </div>

      {/* Achievements */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="display text-3xl tracking-[-0.03em]">Achievements</h2>
          <p className="meta text-muted">{unlockedCount} / {ACHIEVEMENTS.length}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = unlockedMap.has(a.id)
            return (
              <div
                key={a.id}
                className={`rounded-[22px] border-[2.5px] p-4 flex items-start gap-3 ${unlocked ? 'border-[var(--shadow-ink)] bg-lime text-on-bright shadow-(--shadow-sm)' : 'border-line/40 bg-paper-raised opacity-60'}`}
                title={unlocked ? `Unlocked ${new Date(unlockedMap.get(a.id)!).toLocaleDateString()}` : 'Locked'}
              >
                <span className={`text-2xl leading-none ${unlocked ? '' : 'grayscale'}`}>{unlocked ? a.icon : <Lock className="w-6 h-6" strokeWidth={2.2} />}</span>
                <div>
                  <p className="font-extrabold leading-tight">{a.title}</p>
                  <p className={`meta leading-snug mt-0.5 ${unlocked ? 'opacity-80' : 'text-muted'}`}>{a.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, bg }: { icon?: React.ReactNode; label: string; value: string; bg: string }) {
  return (
    <div className={`fill-card ${bg} rounded-[26px] p-4`}>
      <div className="flex items-center gap-2 mb-2 font-bold">
        {icon}
        <span className="meta">{label}</span>
      </div>
      <p className="display text-4xl">{value}</p>
    </div>
  )
}
