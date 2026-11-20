'use client'
import { createContext, useContext, useEffect } from 'react'
import { setTargetLang } from '@/lib/hybrid/ai'
import { langMeta, speechTag, type LangMeta } from '@/lib/langs'

// Carries the signed-in learner's language down to every client component so the
// speak/listen controls, placeholders and prompts target the RIGHT language
// instead of a hardcoded 'fr-FR'. Set once in the (app) layout from the DB user.
interface LangCtx {
  learningLang: string
  nativeLang: string
  meta: LangMeta
  /** BCP-47 tag for TTS/STT, e.g. 'fr-FR'. */
  speechTag: string
  /** Learner's saved TTS voice name (browser SpeechSynthesis), if any. */
  ttsVoice?: string
}

const Ctx = createContext<LangCtx>({
  learningLang: 'fr',
  nativeLang: 'en',
  meta: langMeta('fr'),
  speechTag: 'fr-FR',
})

export function LangProvider({
  learningLang,
  nativeLang,
  ttsVoice,
  children,
}: {
  learningLang: string
  nativeLang: string
  ttsVoice?: string
  children: React.ReactNode
}) {
  const meta = langMeta(learningLang)
  // Tell the AI router which language is being learned (Nano only handles some of them).
  useEffect(() => { setTargetLang(learningLang) }, [learningLang])
  return (
    <Ctx.Provider value={{ learningLang, nativeLang, meta, speechTag: speechTag(learningLang), ttsVoice }}>
      {children}
    </Ctx.Provider>
  )
}

export function useLang() {
  return useContext(Ctx)
}
