import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { connectDB } from '@/lib/db'
import LangiUser from '@/lib/models/LangiUser'
import type { ILangiUser } from '@/lib/models/LangiUser'
import { parseBirthdate } from '@/lib/age'

export async function getUser() {
  const supabase = await createClient()
  // getUser() revalidates the token against Supabase (a network call). When that
  // can't be reached — offline, or a transient Supabase outage — fall back to the
  // session stored locally in cookies so a refresh doesn't force a logout. The
  // cookie session IS the cached login; signing out clears it, so real sign-outs
  // still work. Data mutations stay gated per-route, and are unreachable offline
  // anyway, so trusting the cached session here is safe.
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
  if (user) return user
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
  return session?.user ?? null
}

export async function getDbUser(): Promise<ILangiUser | null> {
  const user = await getUser()
  if (!user) return null
  await connectDB()
  return LangiUser.findOne({ supabaseUserId: user.id })
}

// React cache() dedupes within one render pass: layout + page both calling
// requireUser() only hit Supabase + Mongo once. There is NO approval/quota gate
// — any authenticated Supabase user gets a LangiUser doc and full access.
export const requireUser = cache(async () => {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  await connectDB()
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const dbUser = await LangiUser.findOneAndUpdate(
    { supabaseUserId: user.id },
    {
      $set: { email: user.email },
      $setOnInsert: {
        supabaseUserId: user.id,
        displayName: typeof meta.display_name === 'string' ? meta.display_name : undefined,
        birthdate: parseBirthdate(typeof meta.birthdate === 'string' ? meta.birthdate : null),
        learningLang: 'fr',
        nativeLang: 'en',
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
  return { supabaseUser: user, dbUser: dbUser! }
})
