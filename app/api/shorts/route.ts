import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getMoreShorts, parseShortsMode } from '@/lib/youtube'
import { watchedVideoIds } from '@/lib/ranking'

// Infinite-scroll pagination for the Shorts feed. The client passes the cursor
// it received last; we return the next page of shorts + the following cursor.
export async function GET(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const variant = parseInt(sp.get('variant') || '0', 10) || 0
  const pageToken = sp.get('pageToken') || undefined
  const refresh = sp.get('refresh') === '1'
  const mode = parseShortsMode(sp.get('mode'))
  const watched = await watchedVideoIds(dbUser._id as Parameters<typeof watchedVideoIds>[0], dbUser.learningLang)
  const { items, nextPageToken, variantCount } = await getMoreShorts(dbUser.learningLang, {
    variant,
    pageToken,
    level: dbUser.cefrLevel,
    refresh,
    excludeIds: watched,
    mode,
  })
  return NextResponse.json({ items, nextPageToken: nextPageToken ?? null, variantCount })
}
