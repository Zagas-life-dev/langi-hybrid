import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Route protection (Next.js 16 renamed middleware.ts -> proxy.ts). Any logged-in
// Supabase user may use Langi — there is no admin-approval gate.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() revalidates over the network; getSession() reads the cookie locally.
  // Treat the learner as authenticated if EITHER confirms, so a transient network
  // / Supabase failure (or a refresh right after coming back) can't bounce a
  // logged-in user to /login. Real sign-outs clear the cookie, so getSession then
  // returns null and protection still applies.
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
  let authed = !!user
  if (!authed) {
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
    authed = !!session
  }
  const { pathname } = request.nextUrl

  const publicPaths = ['/login', '/signup', '/forgot-password', '/auth/callback', '/auth/confirm']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))

  if (!authed && !isPublic && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (authed && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/learn', request.url))
  }

  return response
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
