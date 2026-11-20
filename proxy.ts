import { NextResponse, type NextRequest } from 'next/server'
import { sessionLooksLive } from '@/lib/firebase/authCore'

// Route protection (Next.js 16 renamed middleware.ts -> proxy.ts). Any signed-in learner may use
// Langi: there is no admin-approval gate.
//
// This guard only decides redirects, using a cheap expiry check on the session cookie. It does NOT
// verify the signature: every page and API route verifies the cookie properly (lib/auth.ts) before
// it shows or changes any data, so a forged cookie gets a redirect to /login at most.
const SESSION_COOKIE = 'langi_session'

export function proxy(request: NextRequest) {
  const authed = sessionLooksLive(request.cookies.get(SESSION_COOKIE)?.value)
  const { pathname, searchParams } = request.nextUrl

  const publicPaths = ['/login', '/signup', '/forgot-password', '/hybrid-lab']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))

  if (!authed && !isPublic && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // A signed-in learner has no business on /login. But when the app sent them here because their
  // session stopped working (?reauth=1), let the page clear it instead of redirecting back in a loop.
  if (authed && (pathname === '/login' || pathname === '/signup') && !searchParams.has('reauth')) {
    return NextResponse.redirect(new URL('/learn', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Exclude /api so route handlers return their own JSON (e.g. 401) instead of
  // being redirected to /login — each API route calls requireUser() itself.
  //
  // Also exclude the PWA assets: the service worker, manifest, offline page and
  // icons MUST be publicly fetchable. The manifest is requested WITHOUT
  // credentials, and browsers reject a redirected service-worker script — so if
  // these 307'd to /login, the app wouldn't be installable and SW updates would
  // break. They're public static files, so there's nothing to protect.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|sw\\.js|manifest\\.webmanifest|offline\\.html|icon|apple-touch-icon|vosk).*)'],
}
