import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { ensureLesson, grammarTopic, unlockedLevels } from '@/lib/grammar'
import GrammarDrill from '@/components/GrammarDrill'
import LessonReader from '@/components/LessonReader'
import { toParagraphs } from '@/lib/segments'

export const dynamic = 'force-dynamic'

export default async function GrammarLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { dbUser } = await requireUser()

  const topic = grammarTopic(slug)
  if (!topic) notFound()
  if (!unlockedLevels(dbUser.cefrLevel).has(topic.level)) redirect('/learn/grammar')

  const lesson = await ensureLesson(slug)

  if (!lesson) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="display font-display text-3xl mb-3">Couldn&apos;t build this lesson</p>
        <p className="text-muted mb-6">The AI tutor is busy right now. Please try again in a moment.</p>
        <Link href="/learn/grammar" className="btn-ink">Back to grammar</Link>
      </div>
    )
  }

  // toParagraphs (not an inline split) so the pre-warm script segments this
  // lesson exactly as the reader does — see lib/segments.ts.
  const paragraphs = toParagraphs(lesson.explanation)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-center justify-between mb-4">
        <Link href="/learn/grammar" className="meta text-muted hover:text-accent">← Grammar</Link>
        <span className="chip">{lesson.level}</span>
      </div>

      <LessonReader title={lesson.title} summary={lesson.summary} paragraphs={paragraphs} />

      <GrammarDrill
        slug={lesson.slug}
        title={lesson.title}
        examples={lesson.examples.map((e) => ({ fr: e.fr, en: e.en }))}
        drills={lesson.drills.map((d) => ({ prompt: d.prompt, answer: d.answer, hint: d.hint }))}
      />
    </div>
  )
}
