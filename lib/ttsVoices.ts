// Langi's own voices for the local Qwen3-TTS VoiceDesign model (served by
// KoboldCpp). A voice is a description plus a fixed seed: the same pair gives
// the same speaker on every sentence, so a story read line by line stays one
// person. Each was picked by ear from several seeds — changing either the
// description or the seed gives a different voice, and invalidates the clips
// already cached for it.
//
// `language` must be sent with every request: KoboldCpp defaults it to English,
// which makes every voice speak French/Spanish with an English accent.
// Describing the voice in its own language also helps keep the accent native.

import type { TtsStyle } from '@/lib/ttsStyles'

export interface LocalVoice {
  /** Stable id, part of the audio cache key. */
  id: string
  language: string
  seed: number
  instruction: string
}

const STUDIO_EN =
  ' Studio-quality recording on a close microphone: crisp, bright and present, with precise, clean articulation of every consonant. No reverb, no room echo, no background noise, no breathiness.'

export const LOCAL_VOICES: Record<string, LocalVoice> = {
  'fr-teacher': {
    id: 'fr-teacher-v1',
    language: 'fr',
    seed: 1234,
    instruction:
      "Un homme français de naissance, d'une quarantaine d'années, né et élevé à Paris, qui parle un français parisien parfaitement natif, sans aucun accent étranger. " +
      'Voix calme, claire et bienveillante ; un professeur patient qui explique à un élève, un peu plus lentement sur les mots importants. ' +
      'Enregistrement de qualité studio, micro proche : son net, précis et présent, articulation impeccable de chaque consonne, sans écho ni bruit de fond.',
  },
  'es-story': {
    id: 'es-story-v1',
    language: 'es',
    seed: 2024,
    instruction:
      'Una mujer española nativa de unos treinta años, nacida y criada en Madrid, que habla un castellano peninsular perfectamente nativo, sin ningún acento extranjero. ' +
      'Voz cálida y expresiva; una narradora cautivadora, con entonación natural y pausas suaves. ' +
      'Grabación de calidad de estudio, micrófono cercano: sonido nítido, preciso y presente, articulación impecable de cada consonante, sin eco ni ruido de fondo.',
  },
  'es-teacher': {
    id: 'es-teacher-v1',
    language: 'es',
    seed: 1234,
    instruction:
      'A native Spanish man in his forties from Madrid, speaking Castilian Spanish with a natural Spanish accent and no English accent. ' +
      'Calm, clear, friendly voice; a patient teacher, slightly slower on the key words.' + STUDIO_EN,
  },
  // v1 ("warm, soft, slightly husky") came across too intimate; v2 asks for a
  // bright audiobook/radio narrator and rules out a breathy delivery.
  'fr-story': {
    id: 'fr-story-v2',
    language: 'fr',
    seed: 2024,
    instruction:
      "Une Française de naissance d'une trentaine d'années, qui parle un français parfaitement natif, sans aucun accent étranger. " +
      'Voix claire, lumineuse et souriante, avec un ton naturel et professionnel, comme une narratrice de livres audio pour enfants ou une animatrice de radio. ' +
      'Lecture vivante et expressive, rythme posé, sans chuchoter et sans voix sensuelle ni soufflée. ' +
      'Enregistrement de qualité studio, micro proche : son net, précis et présent, articulation impeccable de chaque consonne, sans écho ni bruit de fond.',
  },
}

/** Storytelling styles get the storyteller; everything else the teacher. */
export function localVoiceFor(lang: string, style: TtsStyle): LocalVoice | null {
  const role = style === 'story' || style === 'dramatic' ? 'story' : 'teacher'
  return LOCAL_VOICES[`${lang}-${role}`] ?? LOCAL_VOICES[`${lang}-teacher`] ?? null
}
