import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { weeklyBoard } from '@/lib/league'

// GET ?scope=league|friends → this week's XP leaderboard.
export async function GET(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scope = req.nextUrl.searchParams.get('scope') === 'friends' ? 'friends' : 'league'
  const board = await weeklyBoard(dbUser, scope)
  return NextResponse.json({ scope, ...board })
}
