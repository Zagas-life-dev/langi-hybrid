import { NextResponse, type NextRequest } from 'next/server'
import { adminAuth, adminConfigured } from '@/lib/firebase/admin'
import { ensureDbUser, SESSION_COOKIE, SESSION_DAYS } from '@/lib/auth'

const MAX_AGE_S = SESSION_DAYS * 24 * 60 * 60

// POST {idToken, profile?} → trade a fresh Firebase sign-in for an httpOnly session cookie, and make
// sure the learner has a profile. DELETE → sign out.
export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ error: 'Sign-in is not set up on the server yet (missing FIREBASE_SERVICE_ACCOUNT).' }, { status: 503 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    idToken?: string
    profile?: { displayName?: string; birthdate?: string | null }
  }
  if (!body.idToken) return NextResponse.json({ error: 'idToken required' }, { status: 400 })

  try {
    const auth = adminAuth()
    const decoded = await auth.verifyIdToken(body.idToken)
    // Firebase only mints a session cookie for a sign-in from the last 5 minutes.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    }
    const cookie = await auth.createSessionCookie(body.idToken, { expiresIn: MAX_AGE_S * 1000 })
    const profile = body.profile ?? {}
    const user = await ensureDbUser(decoded.uid, decoded.email ?? null, {
      displayName: (profile.displayName || (typeof decoded.name === 'string' ? decoded.name : '') || '').slice(0, 80),
      birthdate: typeof profile.birthdate === 'string' ? profile.birthdate : null,
    })
    // A brand-new profile has never taken the placement test.
    const isNew = !user.placementTakenAt && !user.cefrLevel

    const res = NextResponse.json({ ok: true, isNew })
    res.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_S,
    })
    return res
  } catch (e) {
    console.warn('[auth] session sign-in failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not start your session. Try again.' }, { status: 401 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
