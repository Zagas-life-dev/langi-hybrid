import LangiUser, { type ILangiUser } from '@/lib/models/LangiUser'
import { parseBirthdate } from '@/lib/age'

/**
 * The learner's profile for a signed-in Firebase user. This runs on EVERY request that needs a user, and
 * Firestore meters reads and writes, so the common case is exactly one read and no write:
 *   - found, same email: return it;
 *   - found, new email: update it (rare);
 *   - not found: create it (first sign-in).
 */
export async function ensureDbUser(
  uid: string,
  email: string | null,
  profile: { displayName?: string; birthdate?: string | null } = {},
): Promise<ILangiUser> {
  const existing = await LangiUser.findOne({ supabaseUserId: uid }) // keyed by uid: one direct read
  if (existing) {
    if (email && existing.email !== email) {
      existing.email = email
      await existing.save()
    }
    return existing
  }
  try {
    return await LangiUser.create({
      supabaseUserId: uid,
      email: email ?? '',
      displayName: profile.displayName?.trim() || undefined,
      birthdate: parseBirthdate(profile.birthdate ?? null),
      learningLang: 'fr',
      nativeLang: 'en',
    })
  } catch (e) {
    // Two first requests raced: the other one created it, so use theirs.
    if ((e as { code?: number }).code === 11000) {
      const created = await LangiUser.findOne({ supabaseUserId: uid })
      if (created) return created
    }
    throw e
  }
}
