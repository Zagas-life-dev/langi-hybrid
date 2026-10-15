// ---------------------------------------------------------------------------
// Offline speech-to-text model registry (Vosk small models, ~40 MB each).
// These power on-device dictation when the browser's native Web Speech API needs
// the network (desktop Chrome/Edge) or the learner is fully offline. Only the
// learner's ACTIVE language is ever downloaded, and only when they opt in.
//
// Hosting: the ~40 MB `.tar.gz` archives are NOT committed to the repo. Point
// NEXT_PUBLIC_STT_MODEL_BASE at wherever you host them (a CORS-enabled bucket, or
// same-origin `/vosk` via `npm run fetch-stt-models`). The default is the
// community vosk-browser model host, which serves CORS-enabled tar.gz files.
// ---------------------------------------------------------------------------

export interface SttModel {
  lang: string // ISO 639-1
  file: string // archive filename under the base URL
  sizeMB: number // approximate download size, for the opt-in prompt
}

const BASE = (
  process.env.NEXT_PUBLIC_STT_MODEL_BASE || 'https://ccoreilly.github.io/vosk-browser/models'
).replace(/\/+$/, '')

// Small (command/short-utterance) models — the right size/latency tradeoff for
// grading single flashcard words. Swap filenames if you self-host different ones.
const MODELS: Record<string, SttModel> = {
  en: { lang: 'en', file: 'vosk-model-small-en-us-0.15.tar.gz', sizeMB: 40 },
  fr: { lang: 'fr', file: 'vosk-model-small-fr-pguyot-0.3.tar.gz', sizeMB: 41 },
  es: { lang: 'es', file: 'vosk-model-small-es-0.3.tar.gz', sizeMB: 39 },
  de: { lang: 'de', file: 'vosk-model-small-de-0.15.tar.gz', sizeMB: 45 },
  it: { lang: 'it', file: 'vosk-model-small-it-0.4.tar.gz', sizeMB: 48 },
  pt: { lang: 'pt', file: 'vosk-model-small-pt-0.3.tar.gz', sizeMB: 31 },
}

/** All configured models — used by the self-hosting fetch script. */
export function allSttModels(): SttModel[] {
  return Object.values(MODELS)
}

/** Normalize a BCP-47 tag ('fr-FR') or ISO code ('fr') to the 2-letter key. */
function toCode(langOrTag: string): string {
  return (langOrTag || '').slice(0, 2).toLowerCase()
}

export function sttModelFor(langOrTag: string): SttModel | undefined {
  return MODELS[toCode(langOrTag)]
}

export function sttModelUrl(model: SttModel): string {
  return `${BASE}/${model.file}`
}

/** True if we have an offline STT model configured for this language. */
export function offlineSttAvailable(langOrTag: string): boolean {
  return !!sttModelFor(langOrTag)
}
