/**
 * Clear cached learning-video feeds so the next page load refetches from
 * YouTube. Use this after changing the curated channels/queries (e.g. the
 * French cartoon channels in lib/youtube.ts) so the new feed shows up
 * immediately instead of waiting out the 7-day cache TTL.
 *
 * Run from the langi/ root:
 *     npm run clear-video-cache              # clears casual for fr (default)
 *     npm run clear-video-cache -- es        # clears casual for es
 *     npm run clear-video-cache -- fr all    # clears every category for fr
 *
 * Loads .env.local and writes to Firestore (FIREBASE_SERVICE_ACCOUNT).
 */
import * as dotenv from 'dotenv'
import VideoCache from '../lib/models/VideoCache'

dotenv.config({ path: '.env.local' })

async function main() {
  const lang = process.argv[2] || 'fr'
  const category = process.argv[3] || 'casual' // or "all"

  console.log('Writing to Firestore project', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)

  const filter: Record<string, unknown> =
    category === 'all'
      ? { languageCode: lang }
      : { languageCode: lang, category }

  const res = await VideoCache.deleteMany(filter)
  console.log(
    `Cleared ${res.deletedCount} cached feed(s) for lang="${lang}" category="${category}". ` +
      `Next load will refetch from YouTube.`
  )

}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
