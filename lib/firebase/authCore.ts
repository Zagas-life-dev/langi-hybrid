// Pure auth helpers (no SDK imports, unit-testable): friendly error text and a cheap cookie check.

/** Turn a Firebase Auth error into words a learner understands. '' means "say nothing" (they closed the popup). */
export function authErrorMessage(e: unknown): string {
  const code = String((e as { code?: unknown })?.code ?? '')
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Wrong email or password.'
    case 'auth/invalid-email':
      return 'That email address does not look right.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead, or continue with Google.'
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 8 characters).'
    case 'auth/account-exists-with-different-credential':
      return 'This email is already registered with a password. Sign in with your email and password.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.'
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/unauthorized-domain':
      return 'This website address is not allowed to sign in yet. Add it under Firebase Authentication > Settings > Authorized domains.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is switched off. Turn it on under Firebase Authentication > Sign-in method.'
  }
  const msg = (e as { message?: unknown })?.message
  return typeof msg === 'string' && msg && !msg.startsWith('Firebase:') ? msg : 'Something went wrong. Try again.'
}

/**
 * Cheap "does this look like a live session?" check for the route guard: decodes the session cookie's
 * expiry WITHOUT verifying its signature. Only used to decide redirects; every page and API route
 * still verifies the cookie properly on the server before it shows any data.
 */
export function sessionLooksLive(cookie: string | undefined, nowMs = Date.now()): boolean {
  if (!cookie) return false
  const parts = cookie.split('.')
  if (parts.length !== 3) return false
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json) as { exp?: unknown }
    return typeof payload.exp === 'number' && payload.exp * 1000 > nowMs
  } catch {
    return false
  }
}
