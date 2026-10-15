import Link from 'next/link'
import Mascot from '@/components/Mascot'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 py-16">
      <div className="relative max-w-lg w-full text-center bg-paper-raised border-[2.5px] border-line rounded-[40px] p-8 sm:p-12 shadow-(--shadow-lg)">
        <span className="sticker sticker-big sticker-pink absolute -top-5 -right-3">Oups !</span>
        <Mascot size={110} className="mx-auto mb-4" />
        <p className="display text-7xl sm:text-8xl tracking-[-0.05em] mb-3">404</p>
        <h1 className="display text-3xl mb-3">Page not found</h1>
        <p className="text-ink-soft mb-8 leading-relaxed">
          That link doesn&apos;t lead anywhere. It may have moved, or never existed.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/learn" className="btn-ink">Back to Today</Link>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </div>
    </div>
  )
}
