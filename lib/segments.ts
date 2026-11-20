
// ---------------------------------------------------------------------------
// How readable content is split into spoken segments.
//
// THIS MODULE IS THE CACHE CONTRACT. The TTS cache key is a hash of the exact
// segment TEXT (plus model/voice/lang/style), so the UI and the pre-warm script
// must split content identically or the warm run produces audio nobody ever
// hits. Both sides import these functions rather than re-implementing the split.
//
// Deliberately dependency-free (no browser APIs, no mongoose) so it can be
// imported from a client component and from a tsx CLI script alike.
// ---------------------------------------------------------------------------

/** Split prose into roughly sentence-sized speakable chunks. */
export function toSegments(text: string): string[] {
  return (text.match(/[^.!?。！？\n]+[.!?。！？]*\s*/g) || [text])
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Paragraphs of a grammar lesson explanation (blank-line separated). */
export function toParagraphs(explanation: string): string[] {
  return explanation.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

/**
 * The spoken sequence for a grammar lesson body, in order: the summary (when
 * present) then every sentence of every paragraph. Mirrors LessonReader.
 */
export function lessonSegments(lesson: { summary?: string; explanation: string }): string[] {
  const body = toParagraphs(lesson.explanation).flatMap(toSegments)
  return lesson.summary ? [lesson.summary, ...body] : body
}

/** Target-language example sentences from a lesson. Mirrors GrammarDrill. */
export function exampleSegments(lesson: { examples?: { fr: string }[] }): string[] {
  return (lesson.examples || []).map((e) => e.fr).filter(Boolean)
}

/** A story is already sentence-split. Mirrors StoryReader. */
export function storySegments(story: { sentences: { text: string }[] }): string[] {
  return (story.sentences || []).map((s) => s.text).filter(Boolean)
}

/**
 * Lesson explanations are written in the learner's NATIVE language, so they're
 * spoken with the native tag rather than the target one. LessonReader derives
 * this the same way; pre-warming uses the default ('en') because that's what
 * the overwhelming majority of accounts have. A learner with a different native
 * language simply misses the warm cache and generates on demand.
 */
export function nativeSpeechTag(nativeLang = 'en'): string {
  return nativeLang === 'en' ? 'en-US' : nativeLang
}
