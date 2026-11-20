'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Volume2, Languages, Check, X, BookOpen, Mic } from 'lucide-react'
import { useTTS, useReadAloud } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import ReadAloudBar from '@/components/ReadAloud'
import { storySegments } from '@/lib/segments'
import { useWordLookup, TappableText, WordLookupCard } from '@/components/WordLookup'
import ShadowingPanel from '@/components/ShadowingPanel'

export interface StoryData {
  title: string
  titleTranslation: string
  level: string
  sentences: { text: string; translation: string }[]
  glossary: { term: string; translation: string }[]
  questions: { question: string; options: string[]; answer: number }[]
}

export default function StoryReader({
  story,
  socialBar,
  storyRef,
}: {
  story: StoryData
  socialBar?: React.ReactNode
  /** Path segment under /learn/stories (id or `t/<slug>`) — saved words link back here. */
  storyRef?: string
}) {
  const { speechTag, ttsVoice } = useLang()
  // tts drives the single-shot buttons (one sentence, a glossary term);
  // readAloud drives continuous playback with the follow-along highlight.
  const tts = useTTS(speechTag, ttsVoice)
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [showAllTranslations, setShowAllTranslations] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [graded, setGraded] = useState(false)
  const [shadowing, setShadowing] = useState(false)
  const wordLookup = useWordLookup()

  // The story is already sentence-split, so it maps straight onto segments.
  const segments = useMemo(() => storySegments(story), [story])
  // 'story' style: warm storyteller delivery. This is the surface expressive
  // reading matters most on — a graded story read flatly is just a word list.
  const readAloud = useReadAloud(segments, speechTag, ttsVoice)
  const toggle = (i: number) => setRevealed((r) => ({ ...r, [i]: !r[i] }))

  const correctCount = story.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <Link href="/learn/stories" className="meta text-muted hover:text-accent">← Stories</Link>

      <div className="flex items-start justify-between gap-4 mt-4 mb-1">
        <h1 className="display font-display text-4xl">{story.title}</h1>
        <span className="meta text-muted shrink-0 mt-2">{story.level}</span>
      </div>
      <p className="text-muted mb-6">{story.titleTranslation}</p>

      {socialBar}

      <ReadAloudBar controls={readAloud} count={segments.length} label="Read aloud" className="mb-3" />

      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => setShowAllTranslations((v) => !v)} className="meta text-muted hover:text-accent flex items-center gap-1.5">
          <Languages className="w-4 h-4" /> {showAllTranslations ? 'Hide translations' : 'Show translations'}
        </button>
        <button onClick={() => { readAloud.stop(); setShadowing((v) => !v) }} className={`meta flex items-center gap-1.5 ${shadowing ? 'text-accent' : 'text-muted hover:text-accent'}`}>
          <Mic className="w-4 h-4" /> {shadowing ? 'Exit shadowing' : 'Shadowing'}
        </button>
      </div>
      <p className="meta text-muted -mt-5 mb-6">Tap any word for its meaning · <Languages className="w-3 h-3 inline" /> for the sentence</p>

      {shadowing && <ShadowingPanel sentences={story.sentences} onClose={() => setShadowing(false)} />}

      {/* Story body — the sentence being read is highlighted; tap a word for its
          meaning, the translate icon for the sentence, or ▸ to read from there. */}
      <article className="border-[2.5px] border-line rounded-[24px] p-6 mb-10 leading-relaxed text-lg">
        {story.sentences.map((s, i) => {
          const open = showAllTranslations || revealed[i]
          const active = readAloud.index === i
          return (
            <span key={i} className="group">
              <span className="read-seg" data-active={active}>
                <TappableText
                  text={s.text}
                  activeTerm={wordLookup.lookup?.term}
                  onWord={(w) => wordLookup.open(w, { kind: 'story', ref: storyRef, context: s.text })}
                />{' '}
              </span>
              <button
                onClick={() => toggle(i)}
                className={`align-middle mr-1 ${open ? 'text-accent' : 'text-muted/50 hover:text-accent'}`}
                aria-label={`Translate sentence ${i + 1}`}
              >
                <Languages className="w-3.5 h-3.5 inline" strokeWidth={2.2} />
              </button>
              {readAloud.supported && (
                <button
                  onClick={() => readAloud.jump(i)}
                  className="align-middle text-muted/50 hover:text-accent mr-1"
                  aria-label={`Read aloud from sentence ${i + 1}`}
                >
                  <Volume2 className="w-3.5 h-3.5 inline" strokeWidth={2.2} />
                </button>
              )}
              {open && (
                <span className="block text-sm text-muted italic my-1 pl-3 border-l-2 border-accent/40">{s.translation}</span>
              )}
            </span>
          )
        })}
      </article>

      {/* Glossary */}
      {story.glossary.length > 0 && (
        <section className="mb-10">
          <p className="meta text-muted mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4" /> Glossary</p>
          <div className="border-[2.5px] border-line rounded-[24px] overflow-hidden divide-y divide-line/25">
            {story.glossary.map((g, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="font-medium flex items-center gap-2">
                  {g.term}
                  {tts.supported && (
                    <button onClick={() => tts.speak(g.term)} className="text-muted hover:text-accent" aria-label="Hear">
                      <Volume2 className="w-3.5 h-3.5" strokeWidth={2.2} />
                    </button>
                  )}
                </span>
                <span className="text-sm text-muted text-right">{g.translation}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comprehension quiz */}
      {story.questions.length > 0 && (
        <section className="mb-10">
          <p className="meta text-muted mb-3">Comprehension</p>
          <div className="space-y-5">
            {story.questions.map((q, qi) => (
              <div key={qi} className="border-[2.5px] border-line rounded-[24px] p-4">
                <p className="font-medium mb-3">{qi + 1}. {q.question}</p>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    const picked = answers[qi] === oi
                    const isAnswer = q.answer === oi
                    const cls = graded
                      ? isAnswer
                        ? 'border-ok bg-ok/5'
                        : picked
                          ? 'border-accent2 bg-accent2/5'
                          : 'border-line/30'
                      : picked
                        ? 'border-accent bg-accent/5'
                        : 'border-line hover:bg-paper-dark'
                    return (
                      <button key={oi} disabled={graded} onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                        className={`w-full text-left p-3 border flex items-center justify-between gap-2 transition-colors ${cls}`}>
                        <span>{opt}</span>
                        {graded && isAnswer && <Check className="w-4 h-4 text-ok shrink-0" />}
                        {graded && picked && !isAnswer && <X className="w-4 h-4 text-accent2 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {!graded ? (
            <button onClick={() => setGraded(true)} disabled={Object.keys(answers).length < story.questions.length}
              className="btn-ink w-full mt-5">Check answers</button>
          ) : (
            <div className="border-[2.5px] border-line rounded-[24px] p-5 mt-5 text-center">
              <p className="display font-display text-3xl mb-1">{correctCount} / {story.questions.length}</p>
              <p className="meta text-muted">{correctCount === story.questions.length ? 'Perfect comprehension. Bravo !' : 'Re-read the story and try the ones you missed.'}</p>
            </div>
          )}
        </section>
      )}

      <Link href="/learn/stories" className="btn-ghost">More stories</Link>

      <WordLookupCard lookup={wordLookup.lookup} onSave={wordLookup.save} onClose={wordLookup.close} onExplain={wordLookup.explain} floating />
    </div>
  )
}
