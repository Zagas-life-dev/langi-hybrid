import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getForYou } from '@/lib/ranking'
import { coverageByVideo } from '@/lib/wordKnowledge'

// Personalized "For You" feed (up to 20). `?refresh=1` busts the YouTube search
// cache so the learner gets fresh, profile-matched videos.
export async function GET(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const docs = await getForYou(dbUser, { limit: 20, refresh })
  const coverage = await coverageByVideo(dbUser, docs.map((d) => d.videoId))
  const items = docs.map((d) => ({
    videoId: d.videoId,
    title: d.title,
    channelTitle: d.channelTitle,
    thumbnail: d.thumbnail,
    coverage: coverage.get(d.videoId)?.coverage,
  }))
  return NextResponse.json({ items })
}
