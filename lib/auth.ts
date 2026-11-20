import { cache } from 'react'
import { cookies } from 'next/headers'
import { adminAuth } from '@/lib/firebase/admin'
import { connectDB } from '@/lib/db'
import LangiUser from '@/lib/models/LangiUser'
import type { ILangiUser } from '@/lib/models/LangiUser'
import { ensureDbUser } from '@/lib/userStore'

export { ensureDbUser }

// Authentication is Firebase Auth (Google + email/password). The browser signs in with the Firebase
// SDK, /api/auth/session turns that into an httpOnly session cookie, and every page and API route
// verifies that cookie here. Profile data still lives in the existing database until each
// collection moves to Firestore; its `supabaseUserId` field now holds the Firebase uid.

export const SESSION_COOKIE = 'langi_session'
/** How long a sign-in lasts. */
export const SESSION_DAYS = 14

/** The signed-in person as the rest of the app sees them. */
export interface AuthUser {
  id: string
  email: string | null
  user_metadata: Record<string, unknown>
}

export async function getUser(): Promise<AuthUser | null> {
  const jar = await cookies()
  const value = jar.get(SESSION_COOKIE)?.value
  if (!value) return null
  try {
    // checkRevoked=false keeps this a local signature check (no network on every request).
    const d = await adminAuth().verifySessionCookie(value, false)
    return {
      id: d.uid,
      email: d.email ?? null,
      user_metadata: { display_name: typeof d.name === 'string' ? d.name : undefined, picture: d.picture },
    }
  } catch {
    return null
  }
}

export async function getDbUser(): Promise<ILangiUser | null> {
  const user = await getUser()
  if (!user) return null
  await connectDB()
  return LangiUser.findOne({ supabaseUserId: user.id })
}

// React cache() dedupes within one render pass: layout + page both calling requireUser() verify the
// cookie and read the profile only once. There is NO approval or quota gate: any signed-in person
// gets a profile and full access.
export const requireUser = cache(async () => {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const meta = user.user_metadata
  const dbUser = await ensureDbUser(user.id, user.email, {
    displayName: typeof meta.display_name === 'string' ? meta.display_name : undefined,
  })
  // `supabaseUser` is the legacy property name; it is the Firebase user now.
  return { supabaseUser: user, dbUser }
})
