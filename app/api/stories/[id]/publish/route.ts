import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Story from '@/lib/models/Story'

// Owner-only: toggle whether a story is published to the community. Publishing
// stamps the author's display name + publish time; un-publishing pulls it back
// (a hidden story can't be re-published until reviewed).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  await connectDB()
  const story = await Story.findById(id).select('userId published hidden')
  if (!story) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (String(story.userId) !== String(dbUser._id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!story.published && story.hidden) {
    return NextResponse.json({ error: 'This story was hidden after reports and can\'t be re-published.' }, { status: 403 })
  }

  const publish = !story.published
  await Story.updateOne(
    { _id: story._id },
    publish
      ? { $set: { published: true, publishedAt: new Date(), authorName: dbUser.displayName || dbUser.email?.split('@')[0] || 'A learner' } }
      : { $set: { published: false } }
  )
  return NextResponse.json({ published: publish })
}
