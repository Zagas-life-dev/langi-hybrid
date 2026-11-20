'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, Sparkles, ArrowRight, RefreshCw, Library, Lock, Dices, Heart, Users, Bookmark } from 'lucide-react'
import { useLang } from '@/components/LangProvider'
import { GENRES, genreByKey, surpriseSeed } from '@/lib/genres'
import { generateStory } from '@/lib/hybrid/generate'

interface Suggested {
  slug: string
  title: string
  titleTranslation: string
  level: string
  topic: string
  length: number
}
interface LibraryStory extends Omit<Suggested, 'slug'> {
  id: string
  genre: string
  createdAt: string
}
interface FeedStory {
  id: string
  title: string
  titleTranslation: string
  level: string
  genre: string
  author?: string
  likes?: number
  length: number
}

type Tab = 'discover' | 'community' | 'saved'
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const IDEAS = ['a day at the market', 'a missed train', 'a small mystery', 'a first job', 'an unexpected guest', 'a trip to the sea']

export default function StoriesBrowser() {
  const router = useRouter()
  const { meta, learningLang, nativeLang } = useLang()
  const [tab, setTab] = useState<Tab>('discover')
  const [suggested, setSuggested] = useState<Suggested[]>([])
  const [library, setLibrary] = useState<LibraryStory[]>([])
  const [community, setCommunity] = useState<FeedStory[] | null>(null)
  const [savedList, setSavedList] = useState<FeedStory[] | null>(null)
  const [level, setLevel] = useState<string>('A1')
  const [unlocked, setUnlocked] = useState<string[]>([])
  const [mature, setMature] = useState(false)
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState('')
  const [genre, setGenre] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/stories')
      const data = await res.json()
      setSuggested(data.suggested || [])
      setLibrary(data.stories || [])
      setUnlocked(data.unlocked || [])
      setMature(Boolean(data.mature))
      if (data.level && LEVELS.includes(data.level)) setLevel(data.level)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])

  // Lazy-load the community + saved feeds the first time their tab is opened.
  useEffect(() => {
    if (tab === 'community' && community === null) {
      fetch('/api/stories/community').then((r) => r.json()).then((d) => setCommunity(d.stories || [])).catch(() => setCommunity([]))
    }
    if (tab === 'saved' && savedList === null) {
      fetch('/api/stories/saved').then((r) => r.json()).then((d) => setSavedList(d.stories || [])).catch(() => setSavedList([]))
    }
  }, [tab, community, savedList])

  const forLevel = useMemo(() => suggested.filter((s) => s.level === level), [suggested, level])

  async function runGenerate(payload: { topic?: string; genre?: string; surprise?: boolean }) {
    if (generating) return
    setGenerating(true); setError(null)
    try {
      // "Surprise me" rolls a random genre + premise. The story itself is written by the cloud
      // model through Firebase AI Logic; the server only stores it.
      let genreKey = (payload.genre || '').trim()
      let premise: string | undefined
      let topicText = (payload.topic || '').trim()
      if (payload.surprise) {
        const seed = surpriseSeed()
        genreKey = seed.genre.key
        premise = seed.premise
        topicText = ''
      }
      const story = await generateStory({ level, lang: learningLang, nativeLang, topic: topicText, genre: genreKey, premise, mature })
      if (!story) { setError('Could not generate a story. Try again.'); setGenerating(false); return }
      const res = await fetch('/api/stories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, topic: topicText, genre: genreKey }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not save the story'); setGenerating(false); return }
      router.push(`/learn/stories/${data.id}`)
    } catch (e) { setError((e as Error).message || 'Could not generate a story'); setGenerating(false) }
  }
  const generate = () => runGenerate({ topic: topic.trim(), genre })
  const surprise = () => runGenerate({ surprise: true })

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'discover', label: 'Discover', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'community', label: 'Community', icon: <Users className="w-4 h-4" /> },
    { key: 'saved', label: 'Saved', icon: <Bookmark className="w-4 h-4" /> },
  ]

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/learn" className="meta text-muted hover:text-accent">← Dashboard</Link>
      <p className="meta text-muted mb-2 mt-4">Reading · {meta.name}</p>
      <h1 className="display font-display text-5xl mb-6">Graded stories</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-2 border-line rounded-full p-1 mb-8 text-sm font-mono w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 flex items-center gap-1.5 uppercase tracking-wide ${tab === t.key ? 'bg-purple text-on-purple' : 'text-muted'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'discover' && (
        <>
          <p className="text-muted mb-8">Read {meta.name} stories at your level — tap any sentence for the translation, hear it read aloud, then check your understanding.</p>

          {/* Curated dataset suggestions FIRST; levels above your reach are locked. */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="meta text-muted mr-1">Level</span>
            {LEVELS.map((l) => {
              const locked = !loading && !unlocked.includes(l)
              return (
                <button key={l} onClick={() => !locked && setLevel(l)} disabled={locked}
                  title={locked ? `Reach ${l} to unlock these stories` : undefined}
                  className={`meta border px-2.5 py-1 flex items-center gap-1 ${
                    level === l ? 'bg-purple text-on-purple border-line' : 'border-line hover:bg-paper-dark'
                  } ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  {locked && <Lock className="w-3 h-3" />}{l}
                </button>
              )
            })}
          </div>

          {loading ? (
            <p className="text-muted mb-10">Loading…</p>
          ) : !unlocked.includes(level) ? (
            <div className="border-[2.5px] border-line rounded-[24px] p-6 mb-10 text-center">
              <Lock className="w-5 h-5 mx-auto mb-2 text-muted" />
              <p className="font-medium mb-1">Level {level} is locked</p>
              <p className="text-sm text-muted">Keep learning to reach this level — then these stories open up. For now, read at your level or below.</p>
            </div>
          ) : forLevel.length > 0 ? (
            <div className="space-y-3 mb-10">
              {forLevel.map((s) => (
                <Link key={s.slug} href={`/learn/stories/t/${s.slug}`} className="brut-card p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate flex items-center gap-2"><BookOpen className="w-4 h-4 shrink-0 text-accent" /> {s.title}</p>
                    <p className="meta text-muted truncate">{s.titleTranslation}{s.topic ? ` · ${s.topic}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="meta text-muted">{s.level} · {s.length} lines</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted mb-10">No curated {level} stories yet — generate one below.</p>
          )}

          {/* AI generation — pick a genre + theme, or roll a true surprise. */}
          <div className="border-[2.5px] border-line rounded-[32px] bg-paper-raised p-6 mb-10 shadow-(--shadow-lg)">
            <p className="meta text-muted mb-1 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Want something else?</p>
            <p className="text-sm text-muted mb-3">Generate a fresh story at your level — pick a genre and theme, or roll the dice.</p>

            {mature && (
              <div className="border border-accent2 bg-accent2/10 px-3 py-2 mb-4 text-sm flex items-start gap-2">

                <span>Mature content is <strong>on</strong> — stories may be dark, intense or graphic. Turn it off in <Link href="/settings" className="underline">Settings</Link>.</span>
              </div>
            )}

            <p className="meta text-muted mb-2">Genre {genre ? '' : '(optional)'}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {GENRES.map((g) => (
                <button key={g.key} onClick={() => setGenre(genre === g.key ? '' : g.key)} disabled={generating}
                  className={`meta border px-2.5 py-1 disabled:opacity-40 ${genre === g.key ? 'bg-accent text-on-accent border-accent' : 'border-line hover:bg-paper-dark'}`}>
                  {g.emoji} {g.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <input value={topic} onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') generate() }}
                placeholder="Optional theme — e.g. a missed train" className="field-brut flex-1" disabled={generating} />
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {IDEAS.map((i) => (
                <button key={i} onClick={() => setTopic(i)} disabled={generating}
                  className="meta border-[2.5px] border-line rounded-[24px] px-2.5 py-1 hover:bg-paper-dark disabled:opacity-40">{i}</button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={generate} disabled={generating} className="btn-ink flex-1">
                {generating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Writing your story…</> : <><Sparkles className="w-4 h-4" /> Generate story</>}
              </button>
              <button onClick={surprise} disabled={generating} className="btn-ghost" title="Random genre + plot">
                <Dices className="w-4 h-4" /> Surprise me
              </button>
            </div>
            {error && <p className="meta text-accent2 mt-3">{error}</p>}
          </div>

          {/* The learner's AI-generated library. */}
          {library.length > 0 && (
            <>
              <p className="meta text-muted mb-3 flex items-center gap-2"><Library className="w-4 h-4" /> Your AI stories</p>
              <div className="space-y-3">
                {library.map((s) => (
                  <Link key={s.id} href={`/learn/stories/${s.id}`} className="brut-card p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate flex items-center gap-2"><BookOpen className="w-4 h-4 shrink-0 text-accent" /> {s.title}</p>
                      <p className="meta text-muted truncate">
                        {genreByKey(s.genre) ? `${genreByKey(s.genre)!.emoji} ${genreByKey(s.genre)!.label} · ` : ''}
                        {s.titleTranslation}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="meta text-muted">{s.level} · {s.length} lines</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'community' && (
        <FeedList
          stories={community}
          emptyText="No published stories yet — be the first! Generate one, then hit Publish on the reader."
        />
      )}

      {tab === 'saved' && (
        <FeedList
          stories={savedList}
          emptyText="Nothing saved yet. Tap the bookmark on any story to keep it here."
        />
      )}
    </div>
  )
}

function FeedList({ stories, emptyText }: { stories: FeedStory[] | null; emptyText: string }) {
  if (stories === null) return <p className="text-muted">Loading…</p>
  if (stories.length === 0) return <p className="text-muted">{emptyText}</p>
  return (
    <div className="space-y-3">
      {stories.map((s) => {
        const g = genreByKey(s.genre)
        return (
          <Link key={s.id} href={`/learn/stories/${s.id}`} className="brut-card p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium truncate flex items-center gap-2"><BookOpen className="w-4 h-4 shrink-0 text-accent" /> {s.title}</p>
              <p className="meta text-muted truncate">
                {g ? `${g.emoji} ${g.label} · ` : ''}{s.titleTranslation}{s.author ? ` · by ${s.author}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {typeof s.likes === 'number' && (
                <span className="meta text-muted flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {s.likes}</span>
              )}
              <span className="meta text-muted">{s.level}</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
