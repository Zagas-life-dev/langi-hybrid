// ---------------------------------------------------------------------------
// Single source of truth for the languages Langi can teach. Everything that used
// to hardcode 'fr-FR' (TTS, STT, placeholders, the speak/listen plumbing) now
// goes through here keyed by the learner's `learningLang` ISO code, so adding a
// language is a one-line entry plus its content — not a code change in a dozen
// components.
// ---------------------------------------------------------------------------

export interface LangMeta {
  code: string        // ISO 639-1, e.g. 'fr' — the key used everywhere
  name: string        // English name, e.g. 'French'
  nativeName: string  // endonym, e.g. 'Français'
  flag: string        // emoji flag
  bcp47: string       // Web Speech API tag, e.g. 'fr-FR'
  /** True once curated static decks + grammar exist on disk. AI features (chat,
   *  stories, dictation, sentence practice) work for any listed language. */
  curated: boolean
}

// Ordered for the language picker. `curated` flags whether hand-authored decks
// ship in data/<lang>/; non-curated languages still get the full AI experience
// (tutor, stories, dictation, sentence practice) generated on demand.
export const LANGUAGES: LangMeta[] = [
  { code: 'fr', name: 'French',     nativeName: 'Français',  flag: '🇫🇷', bcp47: 'fr-FR', curated: true },
  { code: 'es', name: 'Spanish',    nativeName: 'Español',   flag: '🇪🇸', bcp47: 'es-ES', curated: true },
  { code: 'de', name: 'German',     nativeName: 'Deutsch',   flag: '🇩🇪', bcp47: 'de-DE', curated: false },
  { code: 'it', name: 'Italian',    nativeName: 'Italiano',  flag: '🇮🇹', bcp47: 'it-IT', curated: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', bcp47: 'pt-PT', curated: false },
  // Nigerian languages. Content = sentence-pair decks built from open corpora
  // (MENYO-20k, MAFAND-MT) via scripts/build-ng-decks.mjs. Chat/explain use cloud
  // Gemini through AI Logic. Browser TTS rarely has a voice, hence NG tags.
  { code: 'yo', name: 'Yoruba',     nativeName: 'Yorùbá',    flag: '🇳🇬', bcp47: 'yo-NG', curated: true },
  { code: 'ig', name: 'Igbo',       nativeName: 'Igbo',      flag: '🇳🇬', bcp47: 'ig-NG', curated: true },
  { code: 'ha', name: 'Hausa',      nativeName: 'Hausa',     flag: '🇳🇬', bcp47: 'ha-NG', curated: true },
]

const BY_CODE: Record<string, LangMeta> = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]))

// English-name map used in AI prompts. Native languages (the learner's own,
// for translations) can be anything, so this is a superset of LANGUAGES.
const ENGLISH_NAMES: Record<string, string> = {
  fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese',
  en: 'English', nl: 'Dutch', ru: 'Russian', ja: 'Japanese', zh: 'Chinese',
  ar: 'Arabic', ko: 'Korean', tr: 'Turkish', pl: 'Polish', sv: 'Swedish',
  yo: 'Yoruba', ig: 'Igbo', ha: 'Hausa',
}

const DEFAULT_LANG = BY_CODE.fr

export function langMeta(code?: string | null): LangMeta {
  return (code && BY_CODE[code]) || DEFAULT_LANG
}

/** BCP-47 tag for the Web Speech API (TTS + STT). Falls back to fr-FR. */
export function speechTag(code?: string | null): string {
  return langMeta(code).bcp47
}

/** English display name for AI prompts; tolerant of native-language codes. */
export function langName(code?: string | null): string {
  if (!code) return 'French'
  return ENGLISH_NAMES[code] || BY_CODE[code]?.name || code
}

export function isCurated(code?: string | null): boolean {
  return langMeta(code).curated
}

// Short teaching notes appended to AI prompts for languages where a generic "you are a X teacher" prompt
// goes wrong: diacritics carry meaning, there is no grammatical gender, and the model may invent forms.
const LANG_NOTES: Record<string, string> = {
  yo:
    'Yoruba rules: it is tonal, so ALWAYS write Yoruba with tone marks (high ´, low `, mid unmarked) and the ' +
    'underdots (ẹ, ọ, ṣ); never strip diacritics. Yoruba has no grammatical gender and no articles; the third-person ' +
    'pronoun ó/wọ́n does not mark gender. Explain tense and aspect through the markers (ń, ti, yóò/á, kò). Use Standard ' +
    'Yoruba. If you are not sure of a word or form, say so; never invent one.',
  ig:
    'Igbo rules: it is tonal; write Standard Igbo (Igbo Izugbe) with the subdots (ị, ọ, ụ, ṅ) and add tone marks when ' +
    'they change the meaning (e.g. àkwà, ákwá, ákwà, àkwá). Igbo has no grammatical gender and its verbs do not ' +
    'conjugate for person; tense and aspect come from suffixes and auxiliaries, and vowel harmony applies. Mention ' +
    'common dialect variants when a word differs by region. If you are not sure of a word or form, say so; never invent one.',
  ha:
    'Hausa rules: write Standard (Kano) Hausa in the Latin (boko) script with the hooked letters ɓ, ɗ, ƙ and ʼy; never ' +
    'replace them with b, d, k. Hausa is tonal with long and short vowels. Nouns are masculine or feminine (use "m" or ' +
    '"f"), and the pronoun and verb agree: ya (he), ta (she). Explain tense and aspect through the pronoun-aspect ' +
    'markers (na, kana, ya, za, bai). If you are not sure of a word or form, say so; never invent one.',
}

/** Extra prompt text for a target language, or '' when the generic prompt is enough. Starts with a space. */
export function langNotes(code?: string | null): string {
  const n = code ? LANG_NOTES[code] : undefined
  return n ? ` ${n}` : ''
}
