import { NextResponse, after, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { checkLimit } from '@/lib/ratelimit'
import { listTracks, getCaptions, baseCode } from '@/lib/captions'
import { saveVideoProfile } from '@/lib/wordKnowledge'

const VIDEO_ID = /^[\w-]{11}$/
const LANG = /^[a-z]{2,3}(?:[-_][\w]{2,8})?$/i

// GET            → { tracks } — caption languages this video has on YouTube.
// GET ?lang=xx   → { cues, source, from?, part?, parts? } — lines for one
//                  language: the video's own track (human or auto-generated), or
//                  when it has none an AI translation of the learner's
//                  target-language track, one &part=N at a time so each request
//                  stays fast (rate-limited, then cached for everyone).
export async function GET(req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  if (!VIDEO_ID.test(videoId)) return NextResponse.json({ error: 'Bad video id' }, { status: 400 })

  const lang = req.nextUrl.searchParams.get('lang')
  if (!lang) return NextResponse.json({ tracks: await listTracks(videoId) })
  if (!LANG.test(lang)) return NextResponse.json({ error: 'Bad language' }, { status: 400 })

  let limited = false
  const part = Number(req.nextUrl.searchParams.get('part')) || 0
  const result = await getCaptions(videoId, lang, {
    part,
    preferFrom: dbUser.learningLang,
    allowAi: async () => {
      const r = await checkLimit(String(dbUser._id), 'ai')
      limited = !r.ok
      return r.ok
    },
  })
  if (!result) {
    return NextResponse.json(
      { error: limited ? 'Translation limit reached — try again later' : 'No captions in this language' },
      { status: limited ? 429 : 404 },
    )
  }
  // The learner's own-language track doubles as the video's word profile
  // ("you know 87% of the words"); stored once, after the response.
  if (result.source === 'youtube' && baseCode(lang) === dbUser.learningLang) {
    after(() => saveVideoProfile(videoId, dbUser.learningLang, result.cues))
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=3600' } })
}
