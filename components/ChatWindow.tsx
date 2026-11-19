'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Volume2, Square, Mic, Send, Sparkles, MessageSquare, BookOpen, BookmarkPlus, RotateCcw, GraduationCap, Headphones, Keyboard, Loader2, PenLine, Check } from 'lucide-react'
import Mascot from '@/components/Mascot'
import { useTTS, useSTT } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import { useWordLookup, TappableText, WordLookupCard } from '@/components/WordLookup'
import { SCENARIOS, scenarioByKey } from '@/lib/scenarios'
import { conversationStarter, randomTopic, scenarioDebrief, tutorReply } from '@/lib/hybrid/tutor'
import { useHud } from '@/lib/hybrid/hud'
import { LiveCorrectPanel, useLiveCorrect } from '@/components/LiveCorrect'

interface ChatCtx { level: string; lang: string; focus: string[] }

type Mode = 'conversation' | 'grammar'
interface SavedWord { term: string; translation: string; alreadySaved: boolean }
interface Msg { role: 'user' | 'assistant'; content: string; corrections?: string; savedWords?: SavedWord[] }
interface Resumable { sessionId: string; mode: Mode; topic: string | null; scenario: string | null; messages: Msg[] }
interface Debrief { score: number; goalsMet: boolean[]; feedback: string; phrases: { phrase: string; translation: string }[] }
interface Recap {
  words: SavedWord[]
  corrections: string[]
  // Role-play only: the scored debrief (or its loading/error state).
  debrief?: { status: 'loading' } | { status: 'error'; error: string } | ({ status: 'done' } & Debrief)
}

/** Hands-free: listens this many times in a row with nothing heard, then waits for a tap. */
const MAX_SILENT_LISTENS = 2

const scenarioLabel = (key: string | null) => {
  const sc = scenarioByKey(key)
  return sc ? `Role-play: ${sc.label}` : 'Role-play'
}

export default function ChatWindow() {
  const [mode, setMode] = useState<Mode>('conversation')
  const [topic, setTopic] = useState('')
  const [scenario, setScenario] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const wordLookup = useWordLookup()
  const [input, setInput] = useState('')
  const [starting, setStarting] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumable, setResumable] = useState<Resumable | null>(null)
  const [recap, setRecap] = useState<Recap | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hud = useHud()
  const lastEvent = hud.events.find((e) => e.task === 'chat' || e.task === 'deepDive')
  // Level, language and weak spots live on the server; AI runs here in the browser.
  const ctxRef = useRef<ChatCtx | null>(null)
  const [level, setLevel] = useState('A2')
  async function getCtx(): Promise<ChatCtx> {
    if (ctxRef.current) return ctxRef.current
    const res = await fetch('/api/chat/context')
    if (!res.ok) throw new Error('Could not load your profile')
    ctxRef.current = await res.json()
    setLevel(ctxRef.current!.level)
    return ctxRef.current!
  }

  const { speechTag, ttsVoice, nativeLang, learningLang } = useLang()
  const tts = useTTS(speechTag, ttsVoice)
  // Live Correct: on-device feedback on what the learner is typing (conversation mode only).
  const liveOn = true
  // Grammar-mode replies are explanations written in the learner's own
  // language, so reading them with the target-language voice mangles them.
  const nativeTts = useTTS(nativeLang === 'en' ? 'en-US' : nativeLang)
  // Which message the speaker is currently reading, so its button can act as
  // stop — an AI reply can run for 20s and there was previously no way to halt it.
  const [spokenIdx, setSpokenIdx] = useState<number | null>(null)
  const sttLang = mode === 'conversation' ? speechTag : 'en-US'
  // Hands-free voice mode: whatever is heard is sent straight away, the reply
  // is read aloud, and the mic re-opens when it finishes — a spoken
  // conversation with no typing. Silence twice running pauses it until a tap.
  const [handsFree, setHandsFree] = useState(false)
  const [voicePaused, setVoicePaused] = useState(false)
  const silentListens = useRef(0)
  const live = useLiveCorrect(input, learningLang, mode === 'conversation' && liveOn && !handsFree && Boolean(sessionId))
  const stt = useSTT(sttLang, (t) => {
    if (handsFree) {
      silentListens.current = 0
      stt.stop()
      send(t)
    } else {
      setInput((prev) => (prev ? prev + ' ' + t : t))
    }
  })

  const voice = mode === 'conversation' ? tts : nativeTts

  // Clear the "speaking" marker once playback finishes on its own.
  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => { if (!voice.speaking) setSpokenIdx(null) }, [voice.speaking])

  function toggleSpeak(i: number, text: string) {
    if (spokenIdx === i && voice.speaking) {
      voice.cancel()
      setSpokenIdx(null)
      return
    }
    setSpokenIdx(i)
    voice.speak(text)
  }

  // Re-open the mic whenever Langi has finished replying (or nothing was heard).
  const startListening = stt.start
  const canTalk = handsFree && !voicePaused && Boolean(sessionId) && !recap
  useEffect(() => {
    if (!canTalk || sending || voice.speaking || stt.listening) return
    if (silentListens.current >= MAX_SILENT_LISTENS) {
      Promise.resolve().then(() => setVoicePaused(true))
      return
    }
    // A short gap so the tail of the reply isn't picked up by the mic.
    const id = setTimeout(() => { silentListens.current++; startListening() }, 350)
    return () => clearTimeout(id)
  }, [canTalk, sending, voice.speaking, stt.listening, startListening])

  function startVoice() {
    silentListens.current = 0
    setVoicePaused(false)
    setHandsFree(true)
    setInput('')
  }

  function stopVoice() {
    setHandsFree(false)
    setVoicePaused(false)
    stt.stop()
  }

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, sending])

  // On mount, offer to resume the most recent saved chat.
  useEffect(() => {
    fetch('/api/chat/last')
      .then((r) => r.json())
      .then((d) => { if (d.session) setResumable(d.session) })
      .catch(() => {})
  }, [])

  async function start() {
    setStarting(true); setError(null)
    try {
      // Opener comes from Firebase AI Logic (on-device when it can); the server just saves it.
      let starter: Awaited<ReturnType<typeof conversationStarter>> = null
      const chosenTopic = mode === 'conversation' && !scenario ? (topic.trim() || randomTopic()) : undefined
      if (mode === 'conversation') {
        const ctx = await getCtx()
        try {
          starter = await conversationStarter({ topic: chosenTopic, scenario: scenario || undefined, ...ctx })
        } catch { /* empty session if the opener fails */ }
      }
      const res = await fetch('/api/chat/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, topic: chosenTopic, scenario: scenario || undefined, starter }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not start'); setStarting(false); return }
      setSessionId(data.sessionId)
      setTopic(data.topic || '')
      setMessages(data.messages || [])
      setSuggestions(data.suggestions || [])
      if (mode === 'conversation' && data.messages?.[0] && tts.supported) tts.speak(data.messages[0].content)
    } catch { setError('Could not start') }
    setStarting(false)
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!sessionId || !content || sending) return
    setInput('')
    setSuggestions([])
    setMessages((m) => [...m, { role: 'user', content }])
    setSending(true); setError(null)
    try {
      const ctx = await getCtx()
      const history = [...messages, { role: 'user' as const, content }].map((m) => ({ role: m.role, content: m.content }))
      const out = await tutorReply({
        history, mode, topic: topic || null, scenario, ...ctx,
        focus: mode === 'conversation' ? ctx.focus : [],
      })
      const res = await fetch('/api/chat/message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content, ai: out }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not save this message'); setSending(false); return }
      setMessages((m) => [...m, { role: 'assistant', content: out.reply, corrections: out.corrections, savedWords: data.savedWords }])
      setSuggestions(out.suggestions)
      if (mode === 'conversation' && tts.supported) tts.speak(out.reply)
    } catch (e) { setError((e as Error).message || 'AI unavailable') }
    setSending(false)
  }

  // Reopen the most recent saved chat where the learner left off.
  function resumeChat() {
    if (!resumable) return
    setMode(resumable.mode)
    setTopic(resumable.topic || '')
    setScenario(resumable.scenario)
    setMessages(resumable.messages)
    setSessionId(resumable.sessionId)
    setSuggestions([])
    wordLookup.close()
    setRecap(null)
  }

  // Ending a chat shows a recap (new words + corrections) before resetting —
  // turning the session into active study instead of a throwaway transcript.
  function endChat() {
    stopVoice()
    const words: SavedWord[] = []
    const seen = new Set<string>()
    const corrections: string[] = []
    for (const m of messages) {
      for (const w of m.savedWords || []) {
        if (!seen.has(w.term)) { seen.add(w.term); words.push(w) }
      }
      if (m.corrections) corrections.push(m.corrections)
    }
    // A role-play the learner actually took part in always gets a scored debrief.
    const scored = Boolean(scenario && sessionId && messages.some((m) => m.role === 'user'))
    if (words.length || corrections.length || scored) {
      // Stash the just-finished session so it can still be resumed.
      if (sessionId) setResumable({ sessionId, mode, topic: topic || null, scenario, messages })
      setRecap({ words, corrections, debrief: scored ? { status: 'loading' } : undefined })
      if (scored) {
        // Scored in the browser (Firebase AI Logic); the server only awards the XP.
        getCtx()
          .then((ctx) => scenarioDebrief({
            history: messages.map((m) => ({ role: m.role, content: m.content })),
            scenario: scenario!, level: ctx.level, lang: ctx.lang,
          }))
          .then((d) => {
            if (!d) throw new Error('Could not score this scene.')
            setRecap((r) => r && ({ ...r, debrief: { status: 'done', ...d } }))
            fetch('/api/chat/debrief', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, score: d.score }),
            }).catch(() => {})
          })
          .catch((e: Error) => setRecap((r) => r && ({ ...r, debrief: { status: 'error', error: e.message || 'Could not score' } })))
      }
    } else {
      doReset()
    }
  }

  function doReset() {
    if (sessionId) setResumable({ sessionId, mode, topic: topic || null, scenario, messages })
    setSessionId(null); setMessages([]); setSuggestions([]); wordLookup.close(); setRecap(null); setScenario(null); setTopic('')
  }

  // --- Start screen ---
  if (!sessionId) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-end gap-5 mb-8">
          <Mascot size={96} className="shrink-0" />
          <div>
            <span className="sticker sticker-lime mb-3">Speaks French only</span>
            <h1 className="display text-5xl sm:text-6xl tracking-[-0.045em]">Talk to Langi</h1>
          </div>
        </div>

        {resumable && (
          <button onClick={resumeChat}
            className="brut-card w-full mb-5 flex items-center justify-between gap-3 px-5 py-4 text-left">
            <span className="flex items-center gap-3 font-extrabold">
              <span className="w-10 h-10 rounded-full bg-yellow text-on-bright border-[2.5px] border-[var(--shadow-ink)] flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4" strokeWidth={2.6} />
              </span>
              Resume last chat
            </span>
            <span className="meta text-muted truncate max-w-[55%]">
              {resumable.mode === 'grammar'
                ? 'Grammar help'
                : resumable.scenario
                  ? scenarioLabel(resumable.scenario)
                  : resumable.topic || 'Chat'}
            </span>
          </button>
        )}

        <div className="brut-card shadow-(--shadow-lg) p-6 sm:p-8">
          <div className="segmented w-full mb-7" role="group" aria-label="Chat mode">
            <button onClick={() => setMode('conversation')} aria-pressed={mode === 'conversation'}
              className="flex-1 flex items-center justify-center gap-2 min-h-11">
              <MessageSquare className="w-4 h-4" strokeWidth={2.4} /> Conversation
            </button>
            <button onClick={() => setMode('grammar')} aria-pressed={mode === 'grammar'}
              className="flex-1 flex items-center justify-center gap-2 min-h-11">
              <BookOpen className="w-4 h-4" strokeWidth={2.4} /> Grammar help
            </button>
          </div>

          {mode === 'conversation' ? (
            <>
              <p className="display text-xl mb-3">Role-play a scenario <span className="text-muted font-semibold text-base">(optional)</span></p>
              <div className="flex flex-wrap gap-2 mb-5">
                {SCENARIOS.map((s, i) => (
                  <button key={s.key} onClick={() => setScenario(scenario === s.key ? null : s.key)}
                    aria-pressed={scenario === s.key}
                    className={`chip h-11 px-4 border-[var(--shadow-ink)] transition-colors ${
                      scenario === s.key ? 'bg-purple text-on-purple' : `${SCENARIO_FILLS[i % SCENARIO_FILLS.length]} text-on-bright`}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              {scenario && (
                <div className="rounded-[22px] bg-paper border-[2.5px] border-line p-4 mb-6">
                  <p className="font-extrabold mb-2">Your goals</p>
                  <ul className="space-y-1.5">
                    {scenarioByKey(scenario)?.goals.map((g) => (
                      <li key={g} className="flex items-start gap-2">
                        <span className="w-4 h-4 mt-1 rounded-[5px] border-2 border-line shrink-0" aria-hidden="true" />{g}
                      </li>
                    ))}
                  </ul>
                  <p className="meta text-muted mt-3">Press &ldquo;End &amp; get scored&rdquo; when you&apos;re done.</p>
                </div>
              )}
              {!scenario && (
                <>
                  <label htmlFor="chat-topic" className="display text-xl block mb-3">…or pick a topic</label>
                  <input id="chat-topic" value={topic} onChange={(e) => setTopic(e.target.value)}
                    placeholder="le marché, ton week-end, les vacances…" className="field-brut rounded-full px-5 mb-2" />
                  <p className="meta text-muted mb-7">Leave it blank and Langi picks one.</p>
                </>
              )}
            </>
          ) : (
            <p className="text-ink-soft text-lg mb-7 leading-relaxed">Ask anything about grammar, vocabulary or usage. Langi explains in English, with examples.</p>
          )}

          <button onClick={start} disabled={starting} className="btn-ink w-full min-h-[3.5rem] text-lg">
            <Sparkles className="w-5 h-5" strokeWidth={2.4} /> {starting ? 'Starting…' : mode === 'grammar' ? 'Start' : scenario ? 'Start role-play' : topic.trim() ? 'On y va !' : 'Surprise me'}
          </button>
          {error && <p className="meta text-accent2 mt-3" role="alert">{error}</p>}
        </div>
      </div>
    )
  }

  // --- Recap screen (shown when ending a chat with something learned) ---
  if (recap) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="relative fill-card-purple p-7 sm:p-9 mb-6">
          <span className="sticker sticker-big sticker-lime sticker-pop absolute -top-5 -right-2 sm:-right-4">Bien joué !</span>
          <div className="flex items-center gap-5">
            <Mascot variant="yellow" size={88} className="shrink-0" />
            <div>
              <h1 className="display text-4xl sm:text-5xl tracking-[-0.04em]">Chat recap</h1>
              <p className="font-semibold text-[#ede6ff] mt-1">
                {recap.words.length} new word{recap.words.length === 1 ? '' : 's'}
                {recap.corrections.length > 0 ? ` · ${recap.corrections.length} correction${recap.corrections.length === 1 ? '' : 's'}` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="brut-card shadow-(--shadow-lg) p-6 sm:p-7 space-y-7">
          {recap.debrief && <DebriefPanel debrief={recap.debrief} goals={scenarioByKey(scenario)?.goals || []} />}
          <div>
            <p className="display text-xl mb-3 flex items-center gap-2"><BookmarkPlus className="w-5 h-5 text-accent" strokeWidth={2.4} /> New words</p>
            {recap.words.length ? (
              <ul className="flex flex-wrap gap-2">
                {recap.words.map((w) => (
                  <li key={w.term} className="rounded-[18px] bg-pink text-on-bright border-[2.5px] border-[var(--shadow-ink)] px-3.5 py-2">
                    <span className="font-extrabold">{w.term}</span> <span className="font-semibold opacity-80">· {w.translation}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted">No new words this time. Keep chatting !</p>}
          </div>
          {recap.corrections.length > 0 && (
            <div>
              <p className="display text-xl mb-3 flex items-center gap-2"><PenLine className="w-5 h-5 text-accent2" strokeWidth={2.4} /> Corrections to remember</p>
              <ul className="space-y-2">
                {recap.corrections.map((c, i) => (<li key={i} className="fix-box block">{c}</li>))}
              </ul>
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            {recap.words.length > 0 && (
              <Link href="/learn/review/all" className="btn-ink flex-1"><GraduationCap className="w-5 h-5" strokeWidth={2.4} /> Review words</Link>
            )}
            <button onClick={doReset} className="btn-ghost flex-1">New chat</button>
          </div>
        </div>
      </div>
    )
  }

  // --- Chat screen ---
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 pt-3 md:pt-0 flex flex-col h-screen-app">
      {/* Header: who you're talking to, the topic, and the session controls */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <Mascot size={46} className="shrink-0" />
        <div className="min-w-0 mr-auto">
          <p className="display text-xl leading-none">Langi</p>
          <p className="meta text-muted">{mode === 'grammar' ? 'Explains in English' : 'Speaks French only'}</p>
        </div>
        <span className="chip bg-yellow text-on-bright border-[var(--shadow-ink)] max-w-full truncate">
          {mode === 'grammar' ? 'Grammar help' : scenario ? scenarioLabel(scenario) : <>Topic: <strong className="font-extrabold">{topic}</strong></>}
        </span>
        {lastEvent && (
          <span className={`chip border-[var(--shadow-ink)] text-on-bright ${lastEvent.source === 'ON_DEVICE' ? 'bg-lime' : 'bg-sky'}`}
            title={lastEvent.reason}>
            {lastEvent.source === 'ON_DEVICE' ? 'On-device' : 'Cloud'} · {lastEvent.ms} ms
          </span>
        )}
        <div className="flex items-center gap-2">
          {mode === 'conversation' && stt.supported && tts.supported && !handsFree && (
            <button onClick={startVoice} className="btn-ghost min-h-11 px-4 text-sm" title="Talk with Langi hands-free">
              <Headphones className="w-4 h-4" strokeWidth={2.4} /> Voice
            </button>
          )}
          <button onClick={endChat} className="btn-ghost min-h-11 px-4 text-sm">{scenario ? 'End & get scored' : 'End chat'}</button>
        </div>
      </div>
      {scenario && mode === 'conversation' && (
        <p className="meta text-muted mb-2 truncate" title={scenarioByKey(scenario)?.goals.join(' · ')}>
          Goals: {scenarioByKey(scenario)?.goals.join(' · ')}
        </p>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-paper-raised border-[2.5px] border-line rounded-[32px] p-4 sm:p-5 flex flex-col gap-4">
        {messages.map((m, i) => {
          const tappable = m.role === 'assistant' && mode === 'conversation'
          const mine = m.role === 'user'
          return (
            <div key={i} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
              {!mine && <Mascot size={32} className="shrink-0 mb-1 hidden sm:block" />}
              <div className={`bubble ${mine ? 'bubble-me' : 'bubble-langi'}`}>
                <div className="flex items-start gap-2">
                  <p className="leading-relaxed whitespace-pre-wrap">{tappable
                    ? <TappableText text={m.content} activeTerm={wordLookup.lookup?.term} onWord={(w) => wordLookup.open(w, { kind: 'chat', context: m.content })} />
                    : m.content}</p>
                  {/* Now on every assistant reply, not just conversation mode —
                      grammar explanations are read with the native voice. */}
                  {m.role === 'assistant' && voice.supported && (
                    <button
                      onClick={() => toggleSpeak(i, m.content)}
                      className={`shrink-0 mt-0.5 w-8 h-8 -my-1 rounded-full flex items-center justify-center hover:bg-white/80 ${spokenIdx === i && voice.speaking ? 'bg-white' : ''}`}
                      aria-label={spokenIdx === i && voice.speaking ? 'Stop reading' : 'Read this message aloud'}
                    >
                      {spokenIdx === i && voice.speaking
                        ? <Square className="w-4 h-4" strokeWidth={2.4} />
                        : <Volume2 className="w-4 h-4" strokeWidth={2.4} />}
                    </button>
                  )}
                </div>
                {m.corrections && (
                  <p className="fix-box mt-2.5 text-sm font-semibold">{m.corrections}</p>
                )}
                {m.savedWords && m.savedWords.length > 0 && (
                  <div className="text-sm mt-2.5 flex flex-wrap gap-1.5">
                    {m.savedWords.map((w) => (
                      <span key={w.term} className="inline-flex items-center gap-1 rounded-full bg-lime border-2 border-[var(--shadow-ink)] px-2.5 py-0.5 font-semibold">
                        <BookmarkPlus className="w-3.5 h-3.5" strokeWidth={2.4} />
                        {w.alreadySaved ? 'In your words' : 'Added'}: <strong className="font-extrabold">{w.term}</strong> · {w.translation}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {sending && (
          <div className="flex items-end gap-2">
            <Mascot size={32} className="shrink-0 mb-1 hidden sm:block" />
            <span className="bubble bubble-langi flex gap-1.5 py-4" aria-label="Langi is typing">
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-2 h-2 rounded-full bg-[#1b1530] animate-bounce" style={{ animationDelay: `${d * 120}ms` }} />
              ))}
            </span>
          </div>
        )}
        {mode === 'conversation' && messages.some((m) => m.role === 'assistant') && (
          <p className="meta text-muted text-center pt-1 mt-auto">Tap any word to translate it, then save it to your boxes.</p>
        )}
      </div>

      {error && <p className="meta text-accent2 mt-2" role="alert">{error}</p>}

      {/* Tapped-word translation result */}
      <WordLookupCard lookup={wordLookup.lookup} onSave={wordLookup.save} onClose={wordLookup.close} onExplain={wordLookup.explain} />

      {/* Suggested replies */}
      {mode === 'conversation' && suggestions.length > 0 && !sending && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => send(s)}
              className={`chip h-auto min-h-10 py-1.5 text-left border-[var(--shadow-ink)] text-on-bright ${SUGGESTION_FILLS[i % SUGGESTION_FILLS.length]} hover:-translate-y-0.5 transition-transform`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {!handsFree && mode === 'conversation' && liveOn && (
        <LiveCorrectPanel text={input} state={live} lang={learningLang} level={level} onApply={setInput} />
      )}

      {handsFree ? (
        <VoicePanel
          state={sending ? 'thinking' : voice.speaking ? 'speaking' : stt.listening ? 'listening' : voicePaused ? 'paused' : 'idle'}
          onTalk={() => { silentListens.current = 0; setVoicePaused(false); voice.cancel() }}
          onSkip={() => voice.cancel()}
          onExit={stopVoice}
        />
      ) : (
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="answer-pill mt-3 mb-3 md:mb-0">
        <label htmlFor="chat-input" className="sr-only">Message</label>
        <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'conversation' ? 'Écris en français…' : 'Ask a question…'}
          autoComplete="off" />
        {stt.supported && (
          <button type="button" onClick={() => (stt.listening ? stt.stop() : stt.start())}
            className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center border-[2.5px] border-[var(--shadow-ink)] ${stt.listening ? 'bg-pink' : 'bg-white hover:bg-[#f6ebd6]'}`}
            aria-label={stt.listening ? 'Stop listening' : 'Speak'} aria-pressed={stt.listening}>
            <Mic className="w-5 h-5" strokeWidth={2.4} />
          </button>
        )}
        <button type="submit" disabled={sending || !input.trim()}
          className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center bg-purple text-on-purple border-[2.5px] border-[var(--shadow-ink)] disabled:opacity-40" aria-label="Send">
          <Send className="w-5 h-5" strokeWidth={2.4} />
        </button>
      </form>
      )}
      {!stt.supported && <p className="meta text-muted mb-2 text-center">Voice input needs Chrome or Edge. You can still type.</p>}
    </div>
  )
}

// Bright fills for scenario chips and suggested replies, so they read at a glance.
const SCENARIO_FILLS = ['bg-pink', 'bg-sky', 'bg-yellow', 'bg-lime', 'bg-orange']
const SUGGESTION_FILLS = ['bg-pink', 'bg-sky', 'bg-yellow']

type VoiceState = 'listening' | 'thinking' | 'speaking' | 'paused' | 'idle'

/** Hands-free controls in place of the text box: what's happening, plus talk / skip / type. */
function VoicePanel({ state, onTalk, onSkip, onExit }: {
  state: VoiceState
  onTalk: () => void
  onSkip: () => void
  onExit: () => void
}) {
  const label: Record<VoiceState, string> = {
    listening: 'Listening. Just talk.',
    thinking: 'Langi is thinking…',
    speaking: 'Langi is speaking…',
    paused: 'Paused. Tap the mic when you’re ready.',
    idle: 'Getting ready…',
  }
  return (
    <div className="flex items-center gap-3 mt-3 mb-3 md:mb-0 bg-paper-raised border-[2.5px] border-line rounded-full p-2 pr-4" role="status" aria-live="polite">
      <button onClick={onTalk} disabled={state === 'listening' || state === 'thinking'}
        className={`w-14 h-14 shrink-0 rounded-full flex items-center justify-center border-[2.5px] border-[var(--shadow-ink)] text-on-bright ${
          state === 'listening' ? 'bg-pink animate-pulse' : 'bg-lime'}`}
        aria-label={state === 'speaking' ? 'Interrupt and talk' : 'Talk'}>
        {state === 'thinking' ? <Loader2 className="w-6 h-6 animate-spin" strokeWidth={2.4} /> : <Mic className="w-6 h-6" strokeWidth={2.4} />}
      </button>
      <p className="flex-1 font-bold">{label[state]}</p>
      {state === 'speaking' && <button onClick={onSkip} className="meta text-muted hover:text-accent">Skip</button>}
      <button onClick={onExit} className="meta text-muted hover:text-accent inline-flex items-center gap-1.5" title="Back to typing">
        <Keyboard className="w-4 h-4" strokeWidth={2.4} /> Type
      </button>
    </div>
  )
}

function DebriefPanel({ debrief, goals }: { debrief: NonNullable<Recap['debrief']>; goals: string[] }) {
  if (debrief.status === 'loading') return <p className="meta text-muted">Scoring your role-play…</p>
  if (debrief.status === 'error') return <p className="meta text-accent2" role="alert">{debrief.error}</p>
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="display text-xl">Role-play score</p>
        <p className="rounded-full bg-lime text-on-bright border-[2.5px] border-[var(--shadow-ink)] px-4 py-1 display text-3xl">
          {debrief.score}<span className="text-sm font-bold">/100</span>
        </p>
      </div>
      <ul className="space-y-1.5 mb-4">
        {goals.map((g, i) => (
          <li key={g} className={`flex items-start gap-2 ${debrief.goalsMet[i] ? 'font-bold' : 'text-muted'}`}>
            <span className={`w-5 h-5 mt-0.5 rounded-full border-2 border-[var(--shadow-ink)] shrink-0 flex items-center justify-center ${debrief.goalsMet[i] ? 'bg-lime text-on-bright' : 'bg-paper-raised'}`} aria-hidden="true">
              {debrief.goalsMet[i] && <Check className="w-3 h-3" strokeWidth={3.5} />}
            </span>
            <span><span className="sr-only">{debrief.goalsMet[i] ? 'Met: ' : 'Not yet: '}</span>{g}</span>
          </li>
        ))}
      </ul>
      {debrief.feedback && <p className="text-ink-soft mb-4">{debrief.feedback}</p>}
      {debrief.phrases.length > 0 && (
        <>
          <p className="font-extrabold mb-2">Useful phrases for next time</p>
          <ul className="space-y-1.5">
            {debrief.phrases.map((p) => <li key={p.phrase}><strong className="font-extrabold">{p.phrase}</strong> · {p.translation}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}
