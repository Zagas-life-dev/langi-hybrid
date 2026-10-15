import Link from 'next/link'
import Mascot, { Logo } from '@/components/Mascot'

// Shared frame for sign in, sign up and password reset: the logo header, a
// sticker eyebrow, a big headline, and a white outlined card with Langi peeking
// over its top edge.
export default function AuthShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 sm:px-6 py-5">
        <Link href="/" aria-label="Langi home"><Logo /></Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 pt-6 pb-16">
        <div className="w-full max-w-md">
          <span className="sticker sticker-lime mb-5">{eyebrow}</span>
          {/* The bottom margin leaves room for Langi peeking over the card. */}
          <h1 className="display text-5xl sm:text-6xl tracking-[-0.045em] mb-[4.5rem]">{title}</h1>
          <div className="relative">
            <Mascot size={86} className="absolute -top-[66px] right-6 rotate-[6deg]" />
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The white outlined card the auth forms sit in. */
export const AUTH_CARD =
  'relative bg-paper-raised border-[2.5px] border-line rounded-[32px] shadow-(--shadow-lg) p-7 sm:p-9'

/** An inline error that says what went wrong in words, on a pink fill. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-[18px] border-[2.5px] border-[var(--shadow-ink)] bg-pink text-on-bright px-4 py-3 text-sm font-bold">
      {children}
    </div>
  )
}
