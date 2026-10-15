import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import CreatePlaylistForm from '@/components/CreatePlaylistForm'

export const dynamic = 'force-dynamic'

export default async function NewPlaylistPage() {
  await requireUser()
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <Link href="/courses" className="inline-flex items-center gap-2 meta text-muted hover:text-accent mb-5">
        <ArrowLeft className="w-4 h-4" /> Courses
      </Link>
      <h1 className="display font-display text-4xl mb-6">New playlist</h1>
      <CreatePlaylistForm />
    </div>
  )
}
