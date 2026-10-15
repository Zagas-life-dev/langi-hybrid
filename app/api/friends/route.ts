import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { checkLimit } from '@/lib/ratelimit'
import { addFriendByCode, ensureFriendCode, normalizeFriendCode, removeFriend } from '@/lib/league'
import { notifyUser } from '@/lib/notify'
import LangiUser from '@/lib/models/LangiUser'
import { publicName } from '@/lib/leagueCore'

async function me() {
  try {
    return (await requireUser()).dbUser
  } catch {
    return null
  }
}

// GET → my friend code (minted on first use).
export async function GET() {
  const dbUser = await me()
  if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ code: await ensureFriendCode(dbUser), friendCount: dbUser.friends?.length || 0 })
}

// POST {code} → add a friend (mutual). Rate-limited so codes can't be brute-forced.
export async function POST(req: NextRequest) {
  const dbUser = await me()
  if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await checkLimit(String(dbUser._id), 'friends')
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  const clean = normalizeFriendCode(String(code || ''))
  if (clean.length !== 6) return NextResponse.json({ error: 'Friend codes are 6 characters.' }, { status: 400 })

  const out = await addFriendByCode(dbUser, clean)
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 404 })

  const friend = await LangiUser.findOne({ friendCode: clean }).select('_id').lean()
  if (friend) {
    await notifyUser({
      userId: friend._id,
      type: 'friend',
      title: '👋 New friend',
      body: `${publicName(dbUser.displayName, String(dbUser._id))} added you — see who's ahead this week.`,
      url: '/league?scope=friends',
    }).catch(() => {})
  }
  return NextResponse.json({ ok: true, name: out.name })
}

// DELETE ?id=<userId> → unfriend (both directions).
export async function DELETE(req: NextRequest) {
  const dbUser = await me()
  if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await removeFriend(dbUser, req.nextUrl.searchParams.get('id') || '')
  return NextResponse.json({ ok: true })
}
