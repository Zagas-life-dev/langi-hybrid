import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, GraduationCap } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { langName } from '@/lib/langs'
import { connectDB } from '@/lib/db'
import { getVideoMeta } from '@/lib/youtube'
import { getRankedRecommendations, nextInCourse } from '@/lib/ranking'
import { upsertVideoDoc, refineVideoDocWithAI } from '@/lib/videoIndex'
import VideoLike from '@/lib/models/VideoLike'
import VideoComment from '@/lib/models/VideoComment'
import WatchHistory from '@/lib/models/WatchHistory'
import { resumePoint, parseTimestamp } from '@/lib/resume'
import ResumeNotice from '@/components/ResumeNotice'
import VideoPlayer from '@/components/VideoPlayer'
import VideoActions from '@/components/VideoActions'
import VideoComments from '@/components/VideoComments'
import AddToPlaylist from '@/components/AddToPlaylist'
import WatchTracker from '@/components/WatchTracker'
import RecommendedRail from '@/components/RecommendedRail'
import VideoStudyBar from '@/components/VideoStudyBar'
import VideoWords from '@/components/VideoWords'
import { VideoCoverage } from '@/components/VideoCaptions'

export const dynamic = 'force-dynamic'

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>
  searchParams: Promise<{ list?: string; t?: string }>
}) {
  const { dbUser } = await requireUser()
  const { videoId } = await params
  const { list, t } = await searchParams
  const lang = dbUser.learningLang

  // An explicit ?t= (e.g. jumping to a saved word, or ?t=0) wins; otherwise
  // pick up where the learner left off last time.
  await connectDB()
  // `t` takes any YouTube form: ?t=302, ?t=5m2s, ?t=1h2m3s, ?t=28:22.
  const linked = parseTimestamp(t)
  let start = linked && linked > 0 ? linked : undefined
  let resumedAt: number | undefined
  if (t === undefined) {
    const prev = await WatchHistory.findOne({ userId: dbUser._id, videoId }).select('position duration').lean()
    resumedAt = resumePoint(prev?.position, prev?.duration)
    start = resumedAt
  }

  const meta = await getVideoMeta(videoId, lang)
  // Index + lazily AI-refine tags/difficulty for this video (rate-limited, cached).
  if (meta) {
    const doc = await upsertVideoDoc(meta, lang)
    if (doc) await refineVideoDocWithAI(doc, String(dbUser._id))
  }

  const [recommendations, upNext] = await Promise.all([
    getRankedRecommendations(dbUser, videoId),
    nextInCourse(dbUser, videoId, list),
  ])

  const [likeCount, mine, rawComments] = await Promise.all([
    VideoLike.countDocuments({ videoId }),
    VideoLike.exists({ videoId, userId: dbUser._id }),
    VideoComment.find({ videoId }).sort({ createdAt: -1 }).limit(50).lean(),
  ])
  const initialComments = rawComments.map((c) => ({
    id: String(c._id),
    displayName: c.displayName,
    text: c.text,
    createdAt: c.createdAt,
  }))

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <WatchTracker videoId={videoId} playlistId={list} />

      <Link href="/videos" className="inline-flex items-center gap-2 meta text-muted hover:text-accent mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to videos
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main column */}
        <div className="lg:col-span-2 min-w-0">
          <VideoPlayer videoId={videoId} lang={lang} nativeLang={dbUser.nativeLang || 'en'} title={meta?.title} start={start} />
          {resumedAt !== undefined && <ResumeNotice videoId={videoId} at={resumedAt} />}
          <VideoStudyBar videoId={videoId} learning={lang} native={dbUser.nativeLang || 'en'} />

          <h1 className="display font-display text-2xl md:text-3xl mt-5 mb-1 leading-tight">
            {meta?.title || 'Video'}
          </h1>
          {meta?.channelTitle && <p className="meta text-muted mb-2">{meta.channelTitle}</p>}
          <VideoCoverage videoId={videoId} />

          <div className="flex flex-wrap items-center gap-3">
            <VideoActions
              videoId={videoId}
              lang={lang}
              title={meta?.title}
              initialLiked={Boolean(mine)}
              initialCount={likeCount}
            />
            <AddToPlaylist videoId={videoId} />
          </div>

          <p className="meta text-muted mt-3">
            Tip: use <span className="text-ink">CC</span> above to show {labelLang(lang)} and your own language together — tap any {labelLang(lang)} word in the subtitles to look it up.
          </p>

          <VideoWords videoId={videoId} />

          <VideoComments videoId={videoId} initialComments={initialComments} />
        </div>

        {/* Recommendations: sidebar on desktop, bottom on mobile */}
        <div className="lg:col-span-1">
          {upNext && (
            <div className="mb-6">
              <h2 className="display font-display text-xl mb-3 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-accent" strokeWidth={2.2} /> Next in course
              </h2>
              <Link
                href={`/videos/${upNext.item.videoId}?list=${upNext.playlistId}`}
                className="flex gap-3 group border-[2.5px] border-line rounded-[24px] p-2 bg-paper-dark"
              >
                <div className="relative w-40 shrink-0 aspect-video bg-paper-raised border-2 border-line rounded-[14px] overflow-hidden">
                  {upNext.item.thumbnail && (
                    <Image src={upNext.item.thumbnail} alt={upNext.item.title} fill sizes="160px" className="object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="meta text-accent mb-1">{upNext.playlistTitle}</p>
                  <p className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                    {upNext.item.title}
                  </p>
                </div>
              </Link>
            </div>
          )}
          <RecommendedRail items={recommendations} />
        </div>
      </div>
    </div>
  )
}

function labelLang(code: string): string {
  return langName(code) || 'target-language'
}
