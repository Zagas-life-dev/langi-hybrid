'use client'
import { useState } from 'react'
import { Volume2, Languages, Check, Play, Gauge, Sparkles } from 'lucide-react'
import { useLang } from '@/components/LangProvider'
import { useVoices, useTTS, useSpeechRate, setSpeechRate, RATE_MIN, RATE_MAX, useExpressiveEnabled, setExpressiveEnabled } from '@/lib/speech'
import { LANGUAGES } from '@/lib/langs'

const SAMPLE: Record<string, string> = {
  fr: 'Bonjour, je m’appelle Langi. Apprenons ensemble !',
  es: 'Hola, me llamo Langi. ¡Aprendamos juntos!',
  de: 'Hallo, ich heiße Langi. Lass uns zusammen lernen!',
  it: 'Ciao, mi chiamo Langi. Impariamo insieme!',
  pt: 'Olá, eu sou o Langi. Vamos aprender juntos!',
}

async function savePrefs(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('/api/me/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

export default function LanguageVoiceSettings() {
  const { learningLang, speechTag, meta, ttsVoice } = useLang()
  const voices = useVoices(speechTag)
  const [voice, setVoice] = useState(ttsVoice || '')
  const [lang, setLang] = useState(learningLang)
  const [savingLang, setSavingLang] = useState(false)
  const [saved, setSaved] = useState(false)
  const tts = useTTS(speechTag, voice || undefined)
  const rate = useSpeechRate()
  const expressive = useExpressiveEnabled()

  function flash() {
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function onVoice(name: string) {
    setVoice(name)
    await savePrefs({ ttsVoice: name })
    flash()
    const sample = SAMPLE[learningLang] || SAMPLE.fr
    tts.speak(sample, name || undefined)
  }

  async function onLang(code: string) {
    if (code === learningLang) return
    setLang(code)
    setSavingLang(true)
    const ok = await savePrefs({ learningLang: code })
    // The language is read server-side in the (app) layout, so reload to apply it
    // everywhere (decks, prompts, speech) in one shot.
    if (ok) window.location.reload()
    else setSavingLang(false)
  }

  return (
    <>
      {saved && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-purple text-on-purple px-4 py-2 shadow-[4px_4px_0_var(--accent)]">
          <Check className="w-4 h-4" /> <span className="meta">Saved</span>
        </div>
      )}

      {/* Learning language */}
      <section className="brut-card p-6">
        <div className="flex items-start gap-3 mb-5">
          <Languages className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
          <div>
            <h2 className="font-medium text-lg">Language</h2>
            <p className="text-sm text-muted">Which language you&apos;re learning. Curated decks ship for some; the AI tutor, stories and practice work for all.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => onLang(l.code)}
              disabled={savingLang}
              className={`border p-3 text-left transition-colors disabled:opacity-50 ${
                lang === l.code ? 'border-accent bg-accent/5' : 'border-line hover:bg-paper-dark'
              }`}
            >
              <p className="font-medium">{l.flag} {l.name}</p>
              <p className="meta text-muted">{l.nativeName}{l.curated ? '' : ' · AI'}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Speaking voice */}
      <section className="brut-card p-6">
        <div className="flex items-start gap-3 mb-5">
          <Volume2 className="w-5 h-5 mt-0.5 text-accent" strokeWidth={2.2} />
          <div>
            <h2 className="font-medium text-lg">Speaking voice</h2>
            <p className="text-sm text-muted">
              The voice used to read {meta.name} aloud. Higher-quality voices (Enhanced / Natural / Siri) may need to be
              installed in your OS first.
            </p>
          </div>
        </div>
        {!tts.supported ? (
          <p className="meta text-muted">Your browser doesn&apos;t support speech. Try Chrome or Edge.</p>
        ) : voices.length === 0 ? (
          <p className="meta text-muted">No {meta.name} voices are installed on this device yet.</p>
        ) : (
          <div className="flex items-center gap-2">
            <select value={voice} onChange={(e) => onVoice(e.target.value)} className="field-brut flex-1">
              <option value="">Best available (automatic)</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} {v.localService === false ? '· online' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => tts.speak(SAMPLE[learningLang] || SAMPLE.fr, voice || undefined)}
              className="circle-arrow w-11 h-11 shrink-0 hover:bg-paper-dark"
              aria-label="Preview voice"
            >
              <Play className="w-4 h-4" strokeWidth={2.2} />
            </button>
          </div>
        )}

        {/* Reading speed — applies to every spoken thing in the app (flashcards,
            stories, lessons, chat), stored per-device like the theme. */}
        {tts.supported && (
          <div className="mt-6 pt-6 border-t border-line/30">
            <label className="flex items-center gap-2 meta text-muted mb-3" htmlFor="tts-rate">
              <Gauge className="w-4 h-4" strokeWidth={2.2} /> Reading speed · {rate}×
            </label>
            <input
              id="tts-rate"
              type="range"
              min={RATE_MIN}
              max={RATE_MAX}
              step={0.05}
              value={rate}
              onChange={(e) => {
                const next = Number(e.target.value)
                setSpeechRate(next)
                // Speak the sample so the new speed is immediately audible —
                // a number alone means nothing until you hear it.
                tts.speak(SAMPLE[learningLang] || SAMPLE.fr, voice || undefined)
              }}
              className="w-full accent-accent"
            />
            <div className="flex justify-between meta text-muted mt-1">
              <span>Slower</span>
              <span>Faster</span>
            </div>
          </div>
        )}

        {/* Expressive voice — the same preference the transport bar toggles,
            surfaced here because it's a per-device setting that now persists. */}
        <div className="mt-6 pt-6 border-t border-line/30">
          <button
            onClick={() => setExpressiveEnabled(!expressive)}
            className="flex items-center justify-between w-full border-[2.5px] border-line rounded-[24px] p-4 hover:bg-paper-dark transition-colors"
            aria-pressed={expressive}
          >
            <span className="text-left">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="w-4 h-4 text-accent" strokeWidth={2.2} /> Expressive voice
              </span>
              <span className="meta text-muted block mt-1 normal-case tracking-normal">
                Reads with real emotion instead of the flat device voice. Needs a
                connection; falls back automatically when offline.
              </span>
            </span>
            <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${expressive ? 'bg-accent' : 'bg-ink/20'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${expressive ? 'translate-x-6' : 'translate-x-1'}`} />
            </span>
          </button>
        </div>
      </section>
    </>
  )
}
