// Client-safe half of the expressive-TTS contract.
//
// lib/expressiveTts.ts imports mongoose and node:crypto, so it must never be
// pulled into a client bundle. The style *names* are needed on both sides (the
// browser picks one, the server maps it to a performance instruction), so they
// live here on their own.

export const TTS_STYLE_NAMES = [
  'story',
  'teacher',
  'conversational',
  'clear',
  'dramatic',
] as const

export type TtsStyle = (typeof TTS_STYLE_NAMES)[number]
