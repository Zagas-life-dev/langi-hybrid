/**
 * Refresh the Casual & immersion feed from the curated channels in
 * lib/youtube.ts, and purge every cached copy of the language's deprecated
 * channels (LangPack.blockedChannels) from the database.
 *
 * Run from the langi/ root:
 *     npm run refresh-casual-channels           # fr (default)
 *     npm run refresh-casual-channels -- es
 *
 * Steps:
 *   1. Purge blocked channels: pull their videos out of every VideoCache feed
 *      and YtSearchCache page, and delete their VideoDoc + CaptionCache rows.
 *      User data (watch history, playlists, likes, comments) is left alone.
 *   2. Drop the cached casual feed and refetch it via the YouTube API
 *      (channel uploads + the casualMix searches), then index every video.
 *
 * Loads .env.local and writes to Firestore (FIREBASE_SERVICE_ACCOUNT).
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import VideoCache from '../lib/models/VideoCache'
import YtSearchCache from '../lib/models/YtSearchCache'
import VideoDoc from '../lib/models/VideoDoc'
import CaptionCache from '../lib/models/CaptionCache'

async function purge(titles: string[]) {
  if (!titles.length) return
  const match = { channelTitle: { $in: titles } }

  const feeds = await VideoCache.updateMany({ 'items.channelTitle': { $in: titles } }, { $pull: { items: match } })
  const searches = await YtSearchCache.updateMany({ 'items.channelTitle': { $in: titles } }, { $pull: { items: match } })
  const ids = (await VideoDoc.find(match, { videoId: 1 }).lean()).map((d) => d.videoId)
  const docs = await VideoDoc.deleteMany(match)
  const captions = ids.length ? await CaptionCache.deleteMany({ videoId: { $in: ids } }) : { deletedCount: 0 }

  console.log(`Purged ${titles.join(', ')}:`)
  console.log(`  feeds updated: ${feeds.modifiedCount}, search pages updated: ${searches.modifiedCount}`)
  console.log(`  video docs deleted: ${docs.deletedCount}, caption rows deleted: ${captions.deletedCount}`)
}

async function main() {
  const lang = process.argv[2] || 'fr'
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY is not set (check .env.local)')
  // lib/db reads MONGODB_URI at import time, so load these after dotenv.
  const { blockedChannels, getLearningVideos } = await import('../lib/youtube')
  const { upsertVideoDocs } = await import('../lib/videoIndex')
  console.log('Writing to Firestore project', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)

  await purge(blockedChannels(lang))

  await VideoCache.deleteMany({ languageCode: lang, category: 'casual' })
  const { categories } = await getLearningVideos(lang)
  const casual = categories.find((c) => c.key === 'casual')?.items || []
  // getLearningVideos indexes in the background; await it here before exiting.
  await upsertVideoDocs(casual, lang, false)

  const byChannel = new Map<string, number>()
  for (const v of casual) byChannel.set(v.channelTitle, (byChannel.get(v.channelTitle) || 0) + 1)
  console.log(`\nCached ${casual.length} casual videos for "${lang}" from ${byChannel.size} channels:`)
  for (const [ch, n] of [...byChannel].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${ch}`)

}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
