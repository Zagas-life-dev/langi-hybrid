'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Volume2, Mic, ArrowRight, X, RotateCcw, Lightbulb, ListChecks, Keyboard, Flame, WifiOff, Eye, Play } from 'lucide-react'
import Mascot from '@/components/Mascot'
import { useSavedVoice, useSTT } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import PronunciationCheck from '@/components/PronunciationCheck'
import { queueReview, useOnline } from '@/lib/offlineQueue'
import { loadOfflineQueue, refreshPack, gradeOffline, type OfflineCard } from '@/lib/offlineCards'
import { useToast } from '@/components/Toast'
import { haptic } from '@/lib/haptics'
import { generateDistractors, generateExample, lastAiBadge } from '@/lib/hybrid/tutor'
import { judgeAnswer } from '@/lib/hybrid/review'
import HybridBadge, { type HybridBadgeInfo } from '@/components/HybridBadge'
import { checkAnswer } from '@/lib/srs-core'
import { QuizSkeleton } from '@/components/Skeleton'
import GrammarInterlude, { type InterludeQuestion } from '@/components/GrammarInterlude'

const MAX_SESSION_REVIEWS = 3
/** Consecutive correct answers before the combo badge appears. */
const COMBO_THRESHOLD = 3
/** Slip one due grammar question in after this many flashcard answers. */
const INTERLUDE_EVERY = 8

type Direction = 'recognition' | 'production'

interface DueItem {
  cardId: string
  box: number
  isNew: boolean
  prompt: string
  partOfSpeech?: string
  gender?: string
  answerLang: string
  tags: string[]
  /** Sentence card (a saved subtitle line): fill the blank, `hint` is its meaning. */
  cloze?: boolean
  hint?: string
}

interface AnswerResult {
  correct: boolean
  newBox: number
  correctAnswer: string
  term: string
  translation: string
  gender?: string
  exampleSentence?: string
  source?: { kind: string; ref?: string; t?: number }
  exampleTranslation?: string
  newlyMetGoal?: boolean
  unlocked?: { id: string; title: string; icon: string }[]
  // Graded on-device while offline; real feedback shown, answer syncs on reconnect.
  offline?: boolean
  // Set when we couldn't even grade locally (no cached card) — queued blind.
  queued?: boolean
  // Second opinion from the on-device AI when the rules marked a typed answer wrong.
  ai?: { accepted: boolean; reason: string; badge: HybridBadgeInfo }
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function ReviewSession({ deckId, title }: { deckId: string; title: string }) {
  const [direction, setDirection] = useState<Direction>('recognition')
  const [queue, setQueue] = useState<DueItem[]>([])
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'active' | 'answered' | 'done' | 'empty'>('loading')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [stats, setStats] = useState({ reviewed: 0, correct: 0, climbed: 0 })
  const [submitting, setSubmitting] = useState(false)
  // True when 'empty' is because we're offline with nothing cached (vs. genuinely
  // all caught up) — so we can tell the learner to connect once to download cards.
  const [offlineEmpty, setOfflineEmpty] = useState(false)
  // Consecutive-correct counter, plus the best run this session (shown on the
  // summary). Any wrong answer resets the current combo.
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  // AI assist state (reset per card)
  const [exampleHint, setExampleHint] = useState<string | null>(null)
  const [mcq, setMcq] = useState<string[] | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  // Where the hint / choices came from (on-device or cloud): the Hybrid HUD badge.
  const [aiBadge, setAiBadge] = useState<HybridBadgeInfo | null>(null)
  const attempts = useRef<Record<string, number>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  // Full cards (with answers) for on-device grading — kept warm from the pack so
  // a mid-session disconnect can still be graded locally, not just blindly queued.
  const packRef = useRef<Map<string, OfflineCard>>(new Map())
  // Due grammar questions to interleave (fetched once per session, online only).
  const grammarRef = useRef<InterludeQuestion[] | null>(null)
  const [interlude, setInterlude] = useState<InterludeQuestion | null>(null)

  const current = queue[pos]
  const online = useOnline()
  const { toast } = useToast()
  const { learningLang, nativeLang, speechTag, meta, ttsVoice } = useLang()
  // Pre-generated clips (overnight run) when stored, the device voice otherwise.
  const tts = useSavedVoice(speechTag, ttsVoice)
  const sttLang = current?.answerLang === learningLang ? speechTag : 'en-US'
  const stt = useSTT(sttLang, (t) => setAnswer((prev) => (prev ? prev + ' ' + t : t)))

  const load = useCallback(async (dir: Direction) => {
    setPhase('loading')
    setInterlude(null)
    attempts.current = {}
    setStats({ reviewed: 0, correct: 0, climbed: 0 })
    setCombo(0)
    setBestCombo(0)
    setOfflineEmpty(false)
    try {
      // Offline goes straight to the cached deck (no point awaiting a doomed fetch).
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline')
      const params = new URLSearchParams({ direction: dir })
      if (deckId !== 'all') params.set('deckId', deckId)
      const res = await fetch(`/api/review/due?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const items: DueItem[] = data.items || []
      setQueue(items)
      setPos(0)
      resetCardState()
      setPhase(items.length ? 'active' : 'empty')
      // Warm the offline deck in the background so a later trip offline (or a
      // disconnect mid-session) can still load AND grade these cards locally.
      refreshPack(deckId).then((cards) => {
        if (cards) packRef.current = new Map(cards.map((c) => [c.cardId, c]))
      })
      grammarRef.current = null
      fetch('/api/grammar/practice/due')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { grammarRef.current = d?.items ?? [] })
        .catch(() => { grammarRef.current = [] })
    } catch {
      // Offline (or the server is unreachable): review from the locally cached deck.
      const { items, cards } = await loadOfflineQueue(deckId, dir)
      packRef.current = cards
      setQueue(items)
      setPos(0)
      resetCardState()
      setOfflineEmpty(items.length === 0)
      setPhase(items.length ? 'active' : 'empty')
    }
  }, [deckId])

  // Load the due queue on mount and whenever the direction changes (setState
  // happens after the fetch resolves — this is a standard load-on-mount effect).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(direction) }, [direction, load])
  useEffect(() => { if (phase === 'active' && !mcq && !interlude) inputRef.current?.focus() }, [phase, pos, mcq, interlude])

  function resetCardState() {
    setAnswer('')
    setResult(null)
    setExampleHint(null)
    setMcq(null)
    setAiError(null)
    setAiBadge(null)
  }

  async function submit(opts?: { reveal?: boolean; answer?: string }) {
    if (!current || submitting) return
    const toSend = opts?.reveal ? '' : (opts?.answer ?? answer)
    setSubmitting(true)
    const payload: { cardId: string; answer: string; direction: Direction; aiAccepted?: boolean } = { cardId: current.cardId, answer: toSend, direction }

    // Second opinion: if the strict rules say a typed answer is wrong, Gemini Nano (on-device,
    // works offline) checks for a valid synonym or a harmless slip before we grade.
    let ai: AnswerResult['ai']
    // The card's answer comes from the offline pack when it is loaded. Online, that pack arrives in the
    // background and may not hold this card yet, so ask the server (a dry run that records nothing).
    const cached = packRef.current.get(current.cardId)
    let facts: { term: string; translation: string; cloze: boolean; ruleOk: boolean } | null = cached
      ? { term: cached.term, translation: cached.translation, cloze: !!cached.cloze, ruleOk: checkAnswer(cached, toSend, direction, cached.deckTolerance) }
      : null
    if (!facts && toSend.trim() && !opts?.reveal && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const pre = await fetch('/api/review/answer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, preview: true }),
        })
        if (pre.ok) {
          const p = await pre.json()
          facts = { term: p.term, translation: p.translation, cloze: !!p.cloze, ruleOk: !!p.ruleCorrect }
        }
      } catch { /* server unreachable: fall through to the normal grading path */ }
    }
    if (facts && toSend.trim() && !facts.cloze && !opts?.reveal && !facts.ruleOk) {
      const j = await judgeAnswer({
        term: facts.term, translation: facts.translation, answer: toSend.trim(),
        direction, lang: learningLang, nativeLang,
      })
      if (j) {
        ai = { accepted: j.accepted, reason: j.reason, badge: j.badge }
        if (j.accepted) payload.aiAccepted = true
      }
    }
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline')
      const res = await fetch('/api/review/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AnswerResult = { ...(await res.json()), ai }
      setResult(data)
      setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (data.correct ? 1 : 0), climbed: s.climbed + (data.newBox > current.box ? 1 : 0) }))
      scoreStreak(data.correct)
      speakAfterAnswer(data.term)
      celebrate(data)
    } catch {
      // Offline (or the request failed): queue it to sync later so it's graded
      // server-side on replay, then grade on-device now for instant feedback.
      await queueReview(payload).catch(() => {})
      const card = packRef.current.get(current.cardId)
      const local = card ? await gradeOffline(card, toSend, direction, false, payload.aiAccepted === true).catch(() => null) : null
      if (local) {
        setResult({ ...local, offline: true, ai })
        setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (local.correct ? 1 : 0), climbed: s.climbed + (local.newBox > current.box ? 1 : 0) }))
        scoreStreak(local.correct)
        speakAfterAnswer(local.term)
      } else {
        // No cached card to grade against — queue blind and move on.
        setResult({ correct: false, queued: true, newBox: current.box, correctAnswer: '', term: '', translation: '' })
        setStats((s) => ({ ...s, reviewed: s.reviewed + 1 }))
        haptic('tap')
      }
    }
    setPhase('answered')
    setSubmitting(false)
    attempts.current[current.cardId] = (attempts.current[current.cardId] || 0) + 1
  }

  // Recognition cards replay the word; sentence cards read the whole line
  // (only now — before answering it would give the blank away).
  function speakAfterAnswer(term: string) {
    if (!tts.supported || !current) return
    if (current.cloze) tts.speak(term)
    else if (direction === 'recognition') tts.speak(current.prompt)
  }

  // Combo bookkeeping plus the physical feedback that goes with it. Buzzing
  // identically on every answer gets numbing, so the celebrate pattern is held
  // back for milestone streaks.
  function scoreStreak(correct: boolean) {
    if (!correct) {
      setCombo(0)
      haptic('error')
      return
    }
    setCombo((c) => {
      const next = c + 1
      setBestCombo((b) => Math.max(b, next))
      haptic(next % 5 === 0 ? 'celebrate' : 'success')
      return next
    })
  }

  function celebrate(data: AnswerResult) {
    if (data.newlyMetGoal) toast('Daily goal reached. Bravo !', { tone: 'ok', duration: 4000 })
    for (const a of data.unlocked || []) {
      toast(`${a.title} unlocked!`, { tone: 'ok', icon: a.icon, duration: 4000 })
    }
  }

  function next() {
    const wasWrong = result && !result.correct && !result.queued
    const newQueue = [...queue]
    if (wasWrong && current && (attempts.current[current.cardId] || 0) < MAX_SESSION_REVIEWS) {
      newQueue.push({ ...current })
    }
    const nextPos = pos + 1
    setQueue(newQueue)
    resetCardState()
    if (nextPos >= newQueue.length) setPhase('done')
    else {
      setPos(nextPos)
      setPhase('active')
      // Interleave a grammar question every few cards when online.
      const pending = grammarRef.current
      if (online && pending?.length && stats.reviewed > 0 && stats.reviewed % INTERLUDE_EVERY === 0) {
        setInterlude(pending.shift()!)
      }
    }
  }

  // Hints and multiple-choice options are generated by Firebase AI Logic in the browser: Gemini Nano
  // when it can (so they work offline), cloud otherwise. The server only caches them.
  const aiCache = useRef<Map<string, { example?: string; options?: string[] }>>(new Map())

  /** The card's term/translation: from the offline pack, else from the server's 424 reply. */
  function cardFacts(id: string, fromServer?: { term: string; translation: string; lang: string }) {
    const c = packRef.current.get(id)
    if (c) return { term: c.term, translation: c.translation, lang: c.languageCode }
    return fromServer ?? null
  }

  async function loadExample() {
    if (!current) return
    const id = current.cardId
    setAiBusy(true); setAiError(null)
    try {
      const cached = packRef.current.get(id)?.exampleSentence || aiCache.current.get(id)?.example
      if (cached) { setExampleHint(cached); return }

      let serverCard: { term: string; translation: string; lang: string } | undefined
      if (navigator.onLine) {
        try {
          const res = await fetch(`/api/cards/${id}/example`, { method: 'POST' })
          const data = await res.json()
          if (res.ok) { setExampleHint(data.exampleSentence); return }
          serverCard = data.card
        } catch { /* server unreachable: generate on this device instead */ }
      }
      const facts = cardFacts(id, serverCard)
      if (!facts) { setAiError('Open this deck once online to get hints offline.'); return }
      const r = await generateExample(facts.term, facts.translation, facts.lang)
      if (!r) { setAiError('Could not generate an example.'); return }
      setExampleHint(r.exampleSentence)
      setAiBadge(lastAiBadge())
      aiCache.current.set(id, { ...aiCache.current.get(id), example: r.exampleSentence })
      if (navigator.onLine) {
        fetch(`/api/cards/${id}/example`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r),
        }).catch(() => {})
      }
    } catch (e) { setAiError((e as Error).message || 'AI unavailable') }
    finally { setAiBusy(false) }
  }

  async function loadMcq() {
    if (!current) return
    const id = current.cardId
    setAiBusy(true); setAiError(null)
    try {
      const cached = aiCache.current.get(id)?.options
      if (cached) { setMcq(shuffled(cached)); return }

      let serverCard: { term: string; translation: string; lang: string } | undefined
      if (navigator.onLine) {
        try {
          const res = await fetch(`/api/cards/${id}/distractors`, { method: 'POST' })
          const data = await res.json()
          if (res.ok) { setMcq(data.options); return }
          serverCard = data.card
        } catch { /* server unreachable: generate on this device instead */ }
      }
      const facts = cardFacts(id, serverCard)
      if (!facts) { setAiError('Open this deck once online to get choices offline.'); return }
      const list = await generateDistractors(facts.term, facts.translation, facts.lang)
      if (list.length < 3) { setAiError('Could not generate options.'); return }
      // Same clean label the server uses: "hi/hello" becomes "hi".
      const options = shuffled([facts.translation.split(/[/,;]/)[0].trim(), ...list])
      aiCache.current.set(id, { ...aiCache.current.get(id), options })
      setMcq(options)
      setAiBadge(lastAiBadge())
      if (navigator.onLine) {
        fetch(`/api/cards/${id}/distractors`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ distractors: list }),
        }).catch(() => {})
      }
    } catch (e) { setAiError((e as Error).message || 'AI unavailable') }
    finally { setAiBusy(false) }
  }

  const remaining = Math.max(0, queue.length - pos)
  const progressPct = queue.length ? Math.min(100, (pos / queue.length) * 100) : 0
  const canAssist = direction === 'recognition' && !current?.cloze
  const canHear = direction === 'recognition' && !current?.cloze

  /* -------------------------------------------------------------------------
     Keyboard shortcuts.

     The answer field holds focus for most of a session, so typeable keys are
     off-limits while it's focused — the handler bails on input/textarea targets
     except for keys the field itself doesn't consume. Letter shortcuts
     therefore fire in the answered phase (field unmounted) or when the pointer
     has moved focus off the field; digits drive multiple-choice, which has no
     field at all.
  ------------------------------------------------------------------------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (interlude) return // the grammar card handles its own input
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      // Advance from the feedback panel. Space is included because it's the
      // natural "next" key once your hands have left the home row.
      if (phase === 'answered') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          next()
        }
        return
      }

      if (phase !== 'active') return

      // Number keys pick a multiple-choice option (no text field in this mode).
      if (mcq && /^[1-9]$/.test(e.key)) {
        const opt = mcq[Number(e.key) - 1]
        if (opt) { e.preventDefault(); haptic('tap'); submit({ answer: opt }) }
        return
      }

      if (typing) {
        // Escape clears a half-typed answer instead of leaving you on backspace;
        // the field keeps focus.
        if (e.key === 'Escape' && answer) { e.preventDefault(); setAnswer('') }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'r': e.preventDefault(); submit({ reveal: true }); break
        case 'h': // "hear"
          if (canHear && tts.supported && current) { e.preventDefault(); tts.speak(current.prompt) }
          break
        case 'e':
          if (canAssist && !exampleHint) { e.preventDefault(); loadExample() }
          break
        case 'm':
          if (canAssist && !mcq) { e.preventDefault(); loadMcq() }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // next()/submit() close over the current render's state, so the listener is
    // re-bound whenever that state changes rather than stashed in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mcq, answer, current, canAssist, canHear, exampleHint, tts.supported, submitting, queue, pos, result, interlude])

  // The card wears its Leitner box colour; once answered it switches to the box
  // the word lands in, so a right answer visibly climbs.
  const answeredBox = phase === 'answered' && result && !result.queued ? result.newBox : null
  const shownBox = answeredBox ?? (current ? (current.isNew ? 1 : current.box) : 1)
  const reviewedPos = Math.min(queue.length, pos + (phase === 'answered' ? 1 : 0))

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
      {/* Top bar: close, chunky progress, direction */}
      <div className="flex items-center gap-3 mb-3">
        <Link href="/learn" className="circle-arrow w-11 h-11 hover:bg-paper-dark" aria-label="End session, back to Today">
          <X className="w-[18px] h-[18px]" strokeWidth={2.6} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="progress-pill" role="progressbar" aria-valuenow={pos} aria-valuemin={0}
            aria-valuemax={queue.length} aria-label="Session progress">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <span className="font-extrabold text-sm tabular-nums shrink-0">{reviewedPos} / {queue.length}</span>
      </div>

      <div className="flex items-center justify-between gap-3 mb-6 min-h-11">
        <p className="meta text-muted truncate">{title}</p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Combo badge appears only once it's genuinely a run, so it reads as a
              reward rather than a permanent counter. */}
          {combo >= COMBO_THRESHOLD && (
            <span key={combo} className="chip bg-yellow text-on-bright border-[var(--shadow-ink)] pop">
              <Flame className="w-4 h-4" strokeWidth={2.6} /> {combo} in a row
            </span>
          )}
          <div className="segmented" role="group" aria-label="Review direction">
            {(['recognition', 'production'] as Direction[]).map((d) => (
              <button key={d} onClick={() => setDirection(d)} aria-pressed={direction === d}>
                {d === 'recognition' ? `${meta.code.toUpperCase()} → EN` : `EN → ${meta.code.toUpperCase()}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!online && (
        <div className="rounded-[20px] border-[2.5px] border-[var(--shadow-ink)] bg-yellow text-on-bright px-4 py-3 mb-6 text-sm font-bold flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" strokeWidth={2.6} />
          You&apos;re offline. Keep reviewing, your answers sync when you reconnect.
        </div>
      )}

      {phase === 'loading' && <QuizSkeleton label="Loading your cards" />}

      {phase === 'empty' && (
        <div className="brut-card shadow-(--shadow-lg) p-8 sm:p-10 text-center">
          <Mascot size={96} className="mx-auto mb-4" />
          {offlineEmpty ? (
            <>
              <p className="display text-3xl mb-3">No cards downloaded yet</p>
              <p className="text-ink-soft mb-7">You&apos;re offline and this deck hasn&apos;t been saved to this device. Connect once and open the deck, and your due cards download for offline review.</p>
            </>
          ) : (
            <>
              <p className="display text-3xl mb-3">All caught up. Bravo !</p>
              <p className="text-ink-soft mb-7">Nothing in this deck is due right now. Come back later, or pick another deck.</p>
            </>
          )}
          <Link href="/learn" className="btn-ink">Back to Today</Link>
        </div>
      )}

      {phase === 'done' && (
        <SessionSummary stats={stats} bestCombo={bestCombo} onAgain={() => load(direction)} />
      )}

      {interlude && phase === 'active' && (
        <GrammarInterlude key={interlude.id} q={interlude} onDone={() => setInterlude(null)} />
      )}

      {!interlude && (phase === 'active' || phase === 'answered') && current && (
        <div>
          <div className="relative mb-7">
            <div className="flashcard-stack" aria-hidden="true" />

            {/* Keyed on the card so each new prompt replays the entrance animation. */}
            <div
              key={`${current.cardId}-${pos}`}
              data-box={shownBox}
              className={`flashcard p-5 sm:p-7 flex flex-col gap-5 card-enter ${
                phase === 'answered' && result && !result.correct && !result.queued ? 'shake' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="chip">
                  {current.isNew && !answeredBox ? 'New word' : `Box ${shownBox}`}
                  <span className="opacity-70 font-bold">· {remaining} left</span>
                </span>
                {canHear && tts.supported && (
                  <button onClick={() => tts.speak(current.prompt)} className="circle-arrow w-12 h-12 hover:scale-105"
                    aria-label="Hear pronunciation" title="Hear (H)">
                    <Volume2 className="w-5 h-5" strokeWidth={2.4} />
                  </button>
                )}
              </div>

              <div className="flex flex-col items-center gap-2 text-center py-4 sm:py-6">
                {(current.partOfSpeech || current.gender) && (
                  <span className="text-[0.95rem] font-bold">
                    {[current.partOfSpeech, current.gender].filter(Boolean).join(' · ')}
                  </span>
                )}
                <p className={`display tracking-[-0.03em] wrap-break-word max-w-full ${
                  current.cloze ? 'text-2xl sm:text-3xl leading-snug' : 'text-[clamp(2.6rem,9vw,4.25rem)] leading-none'
                }`}>{current.prompt}</p>
                {current.hint && <p className="font-semibold mt-1">{current.hint}</p>}
                {exampleHint && (
                  <p className="mt-3 bg-white/70 rounded-[16px] px-4 py-2 font-medium italic flex items-start gap-2 text-left">
                    <Lightbulb className="w-4 h-4 mt-1 shrink-0" strokeWidth={2.4} /> <span className="flex-1">{exampleHint}</span>
                  </p>
                )}
                {(exampleHint || mcq) && aiBadge && <p className="mt-2"><HybridBadge {...aiBadge} /></p>}
              </div>

              {/* Answer pill, inside the card */}
              {phase === 'active' && !mcq && (
                <form onSubmit={(e) => { e.preventDefault(); submit() }} className="answer-pill">
                  <input ref={inputRef} value={answer} onChange={(e) => setAnswer(e.target.value)}
                    placeholder={current.cloze ? 'Type the missing word…' : current.answerLang === learningLang ? `Écris en ${meta.name}…` : 'Type the English…'}
                    aria-label={current.answerLang === learningLang ? `Your answer in ${meta.name}` : 'Your answer in English'}
                    autoComplete="off" autoCapitalize="off" spellCheck={false} />
                  {stt.supported && (
                    <button type="button" onClick={() => (stt.listening ? stt.stop() : stt.start())}
                      className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center border-[2.5px] border-[var(--shadow-ink)] transition-colors ${
                        stt.listening ? 'bg-pink' : 'bg-white hover:bg-[#f6ebd6]'}`}
                      aria-label={stt.listening ? 'Stop listening' : 'Answer by voice'} aria-pressed={stt.listening}>
                      <Mic className="w-5 h-5" strokeWidth={2.4} />
                    </button>
                  )}
                  <button type="submit" disabled={submitting} className="btn-ink px-6">Check</button>
                </form>
              )}

              {/* The reveal, inside the card once answered */}
              {phase === 'answered' && result && !result.queued && (
                <div className="bg-white rounded-[24px] border-[2.5px] border-[var(--shadow-ink)] p-4 sm:p-5 text-left">
                  <p className="text-lg">
                    <span className="font-semibold opacity-75">Answer: </span>
                    <span className="font-extrabold">{result.correctAnswer}</span>
                    {result.gender && direction !== 'recognition' && <span className="opacity-75"> ({result.gender})</span>}
                  </p>
                  <p className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{result.term}</span><span className="opacity-60">=</span><span>{result.translation}</span>
                    {tts.supported && (
                      <button onClick={() => tts.speak(result.term)} className="opacity-70 hover:opacity-100" aria-label="Hear the word">
                        <Volume2 className="w-4 h-4" strokeWidth={2.4} />
                      </button>
                    )}
                  </p>
                  {result.exampleSentence && (
                    <p className="mt-3 pt-3 border-t-2 border-dashed border-[#1b1530]/25 italic">
                      {result.exampleSentence}
                      {result.exampleTranslation && <span className="not-italic opacity-75"> · {result.exampleTranslation}</span>}
                    </p>
                  )}
                  {sourceHref(result.source) && (
                    <Link href={sourceHref(result.source)!} className="inline-flex items-center gap-1.5 mt-3 font-extrabold text-[#5528e0] hover:underline">
                      <Play className="w-3.5 h-3.5" strokeWidth={2.6} fill="currentColor" />
                      {result.source!.kind === 'video' ? 'Watch where you heard it' : 'Read where you found it'}
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Feedback sticker over the corner: always words, never colour alone. */}
            {phase === 'answered' && result && !result.queued && (
              <span key={`st-${pos}`} className={`sticker sticker-big sticker-pop absolute -top-5 -right-2 sm:-right-4 z-10 ${result.correct ? 'sticker-lime' : ''}`}>
                {result.correct ? `Oui ! Box ${result.newBox}` : 'Presque !'}
              </span>
            )}
          </div>

          {phase === 'active' && (
            <div>
              {/* Multiple-choice mode: big tappable chips */}
              {mcq ? (
                <div className="mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {mcq.map((opt, i) => (
                      <button key={opt} onClick={() => submit({ answer: opt })} disabled={submitting}
                        className="brut-card min-h-14 text-left px-5 py-3 flex items-center gap-3 font-bold rounded-full">
                        <span className="kbd shrink-0">{i + 1}</span>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setMcq(null)} className="meta text-muted hover:text-accent flex items-center gap-1.5 mt-4">
                    <Keyboard className="w-4 h-4" strokeWidth={2.4} /> Type instead
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button type="button" onClick={() => submit({ reveal: true })} disabled={submitting} className="btn-ghost min-h-[2.75rem] px-5" title="Reveal (R)">
                    <Eye className="w-4 h-4" strokeWidth={2.4} /> Reveal
                  </button>
                  {/* AI assist (recognition only) */}
                  {canAssist && (
                    <>
                      <button onClick={loadExample} disabled={aiBusy || !!exampleHint}
                        className="chip bg-pink text-on-bright border-[var(--shadow-ink)] h-[2.75rem] px-4 disabled:opacity-50" title="Example (E)">
                        <Lightbulb className="w-4 h-4" strokeWidth={2.4} /> {exampleHint ? 'Example shown' : 'Give me an example'}
                      </button>
                      <button onClick={loadMcq} disabled={aiBusy}
                        className="chip bg-sky text-on-bright border-[var(--shadow-ink)] h-[2.75rem] px-4 disabled:opacity-50" title="Multiple choice (M)">
                        <ListChecks className="w-4 h-4" strokeWidth={2.4} /> Multiple choice
                      </button>
                    </>
                  )}
                  {aiBusy && <span className="meta text-muted">Langi is thinking…</span>}
                </div>
              )}
              {aiError && <p className="meta text-accent2 mt-3" role="alert">{aiError}</p>}

              {/* Voice input status */}
              {!mcq && (
                <div className="meta text-muted mt-4">
                  {!stt.supported ? (
                    <p>Voice input needs Chrome or Edge. You can still type.</p>
                  ) : !online || stt.needsNetwork ? (
                    <p>Voice input needs a connection on this device. Type your answer instead.</p>
                  ) : null}
                </div>
              )}

              {/* Shortcut legend — pointer devices only, it's noise on touch. */}
              <div className="hidden md:flex items-center gap-3 mt-6 meta text-muted flex-wrap">
                <span className="flex items-center gap-1"><span className="kbd">↵</span> check</span>
                <span className="flex items-center gap-1"><span className="kbd">R</span> reveal</span>
                {canHear && tts.supported && <span className="flex items-center gap-1"><span className="kbd">H</span> hear</span>}
                {canAssist && <span className="flex items-center gap-1"><span className="kbd">E</span> example</span>}
                {canAssist && <span className="flex items-center gap-1"><span className="kbd">M</span> choices</span>}
              </div>
            </div>
          )}

          {/* role=status announces the grade without stealing focus. */}
          {phase === 'answered' && result?.queued && (
            <div role="status">
              <div className="brut-card p-5 mb-4">
                <div className="flex items-center gap-2 font-extrabold mb-1"><WifiOff className="w-4 h-4" strokeWidth={2.6} /> Saved offline</div>
                <p className="text-sm text-ink-soft">You&apos;re offline. This review is queued and gets graded when you reconnect.</p>
              </div>
              <button onClick={next} className="btn-ink w-full min-h-[3.4rem] text-lg">Next word <ArrowRight className="w-5 h-5" strokeWidth={2.6} /></button>
            </div>
          )}

          {phase === 'answered' && result && !result.queued && (
            <div role="status">
              <p className="font-bold text-lg mb-4 flex items-center gap-2 flex-wrap">
                {result.correct
                  ? `Nice. See you again in box ${result.newBox}.`
                  : `It means "${result.correctAnswer}". Back to box ${result.newBox}, no stress.`}
                {result.offline && <span className="chip bg-paper-dark"><WifiOff className="w-3.5 h-3.5" strokeWidth={2.4} /> graded offline</span>}
              </p>
              {result.ai && (
                <p className="mb-4 text-sm flex items-center gap-2 flex-wrap" data-testid="ai-verdict">
                  <HybridBadge {...result.ai.badge} />
                  <span className="text-ink-soft">
                    {result.ai.accepted ? 'Accepted by on-device AI' : 'Checked by on-device AI'}
                    {result.ai.reason ? `: ${result.ai.reason}` : ''}
                  </span>
                </p>
              )}
              {result.term && (
                <div className="mb-5">
                  <PronunciationCheck target={result.term} label="Now say it aloud" />
                </div>
              )}
              <button onClick={next} className="btn-ink w-full min-h-[3.4rem] text-lg">
                Next word <ArrowRight className="w-5 h-5" strokeWidth={2.6} />
                <span className="hidden md:inline kbd ml-1">↵</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * End-of-session screen. Was a bare "x / y correct" line; now leads with the
 * accuracy figure people actually look for and names the best streak, so a
 * good run gets acknowledged.
 */
/** Deep link back to where a saved word was found, if we know. */
function sourceHref(src?: AnswerResult['source']): string | null {
  if (!src?.ref) return null
  if (src.kind === 'video') return `/videos/${encodeURIComponent(src.ref)}${src.t ? `?t=${Math.max(0, src.t - 2)}` : ''}`
  if (src.kind === 'story') return `/learn/stories/${src.ref}`
  return null
}

function SessionSummary({
  stats,
  bestCombo,
  onAgain,
}: {
  stats: { reviewed: number; correct: number; climbed: number }
  bestCombo: number
  onAgain: () => void
}) {
  const pct = stats.reviewed ? Math.round((stats.correct / stats.reviewed) * 100) : 0
  const missed = stats.reviewed - stats.correct
  const headline = pct === 100 ? 'Parfait !' : pct >= 80 ? 'Très bien !' : pct >= 50 ? 'Pas mal !' : 'Courage !'

  return (
    <div className="relative fill-card-purple p-7 sm:p-10 text-center" role="status">
      <span className="sticker sticker-big sticker-lime sticker-pop absolute -top-5 -right-2 sm:-right-4">Session done</span>
      <Mascot variant="yellow" size={104} className="mx-auto mb-3" />
      <p className="display text-5xl sm:text-6xl tracking-[-0.04em] mb-2">{headline}</p>
      {/* Lead with progress made, the number that makes tomorrow feel worth it. */}
      <p className="text-lg font-semibold text-[#ede6ff] mb-7">
        {stats.climbed > 0
          ? `${stats.climbed} word${stats.climbed === 1 ? '' : 's'} climbed a box tonight.`
          : `${stats.reviewed} card${stats.reviewed === 1 ? '' : 's'} reviewed.`}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-7">
        <SummaryStat value={`${pct}%`} label="Right" bg="bg-lime" />
        <SummaryStat value={String(stats.climbed)} label="Climbed" bg="bg-sky" />
        <SummaryStat
          value={String(bestCombo)}
          label="Best run"
          bg="bg-yellow"
          icon={bestCombo >= COMBO_THRESHOLD ? <Flame className="w-5 h-5" strokeWidth={2.6} /> : null}
        />
      </div>

      <p className="text-[#ede6ff] font-semibold mb-8">
        {missed > 0
          ? `${missed} word${missed === 1 ? '' : 's'} went back to box 1. You'll see ${missed === 1 ? 'it' : 'them'} again sooner.`
          : 'Everything right. Those words come back less often now.'}
      </p>

      <div className="flex gap-3 justify-center flex-wrap">
        <button onClick={onAgain} className="btn-ghost border-[var(--shadow-ink)]"><RotateCcw className="w-4 h-4" strokeWidth={2.6} /> Again</button>
        <Link href="/learn" className="btn-lime">Back to Today <ArrowRight className="w-4 h-4" strokeWidth={2.6} /></Link>
      </div>
    </div>
  )
}

function SummaryStat({ value, label, bg, icon }: { value: string; label: string; bg: string; icon?: React.ReactNode }) {
  return (
    <div className={`${bg} text-on-bright rounded-[22px] border-[2.5px] border-[var(--shadow-ink)] p-3 sm:p-4`}>
      <p className="display text-3xl sm:text-4xl flex items-center justify-center gap-1">{icon}{value}</p>
      <p className="text-sm font-extrabold mt-1">{label}</p>
    </div>
  )
}
