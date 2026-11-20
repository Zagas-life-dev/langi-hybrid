'use client'
// Browser sign-in with Firebase Auth. After every sign-in the ID token is traded for an httpOnly
// session cookie at /api/auth/session, which is what the server checks on each request.
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  getAuth,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { getFirebaseApp } from '@/lib/hybrid/firebase'

export interface SignupProfile { displayName?: string; birthdate?: string | null }
export interface SessionResult {
  /** True for a first sign-in: send them to the placement test. */
  isNew: boolean
}

const auth = () => getAuth(getFirebaseApp())

async function startSession(user: User, profile?: SignupProfile): Promise<SessionResult> {
  const idToken = await user.getIdToken(true)
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, profile }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not start your session. Try again.')
  return { isNew: Boolean(data.isNew) }
}

/** Google sign-in works for both new and returning learners. `profile` is used only on a first sign-in. */
export async function signInWithGoogle(profile?: SignupProfile): Promise<SessionResult> {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const cred = await signInWithPopup(auth(), provider)
  const info = getAdditionalUserInfo(cred)
  const out = await startSession(cred.user, { displayName: cred.user.displayName ?? undefined, ...profile })
  return { isNew: out.isNew || Boolean(info?.isNewUser) }
}

export async function signUpWithEmail(args: { email: string; password: string; displayName: string; birthdate: string }): Promise<SessionResult> {
  const cred = await createUserWithEmailAndPassword(auth(), args.email.trim(), args.password)
  await updateProfile(cred.user, { displayName: args.displayName.trim() }).catch(() => {})
  return startSession(cred.user, { displayName: args.displayName.trim(), birthdate: args.birthdate })
}

export async function signInWithEmail(email: string, password: string): Promise<SessionResult> {
  const cred = await signInWithEmailAndPassword(auth(), email.trim(), password)
  return startSession(cred.user)
}

export async function sendResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth(), email.trim())
}

/** Sign out of Firebase and drop the server session cookie. */
export async function signOutClient(): Promise<void> {
  try { await signOut(auth()) } catch { /* not signed in on this page: still clear the cookie */ }
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
}
