import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { connectDB } from '@/lib/db'
import LangiUser from '@/lib/models/LangiUser'
import { parseBirthdate } from '@/lib/age'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/learn'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      await connectDB()
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
      await LangiUser.findOneAndUpdate(
        { supabaseUserId: data.user.id },
        {
          $set: { email: data.user.email },
          $setOnInsert: {
            supabaseUserId: data.user.id,
            displayName: typeof meta.display_name === 'string' ? meta.display_name : undefined,
            birthdate: parseBirthdate(typeof meta.birthdate === 'string' ? meta.birthdate : null),
            learningLang: 'fr',
            nativeLang: 'en',
          },
        },
        { upsert: true, returnDocument: 'after' }
      )
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
