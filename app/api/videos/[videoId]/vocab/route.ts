import { NextResponse, after } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getCaptions } from '@/lib/captions'
import { userKnowledge, statusOf, coverageFor, saveVideoProfile } from '@/lib/wordKnowledge'
import { vocabProfile, type WordStatus } from '@/lib/wordsCore'

const VIDEO_ID = /^[\w-]{11}$/

// GET → { coverage, newWords, words } for the learner and this video's
// target-language captions. `words` lists only the words NOT yet known
// (key → 'learning' | 'new'), so the subtitle overlay can highlight them.
// Dictionary + SRS only — no AI. 404 when the video has no such captions.
export async function GET(_req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  if (!VIDEO_ID.test(videoId)) return NextResponse.json({ error: 'Bad video id' }, { status: 400 })

  const lang = dbUser.learningLang
  const captions = await getCaptions(videoId, lang)
  if (!captions || captions.source !== 'youtube') {
    return NextResponse.json({ error: 'No captions in this language' }, { status: 404 })
  }
  after(() => saveVideoProfile(videoId, lang, captions.cues))

  const { vocab } = vocabProfile(captions.cues.map((c) => c.text), Infinity)
  const k = await userKnowledge(dbUser)
  const words: Record<string, Exclude<WordStatus, 'known'>> = {}
  for (const { w } of vocab) {
    const s = statusOf(k, w)
    if (s !== 'known') words[w] = s
  }
  return NextResponse.json({ ...coverageFor(k, vocab), words }, { headers: { 'Cache-Control': 'private, no-store' } })
}
