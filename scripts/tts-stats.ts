/**
 * Report on the expressive-speech cache.
 *
 *     npm run tts-stats
 *
 * Answers the questions that actually matter for cost: how much audio are we
 * storing, how much re-use are we getting out of it (every hit past the first
 * is a generation we did NOT pay for), and is anything sitting cold.
 */
// Env comes from `tsx --env-file=.env.local` in the npm script — it must be
// loaded before lib/db is imported, and ES import hoisting makes an in-file
// dotenv.config() run too late to help.
import mongoose from 'mongoose'
import { connectDB } from '../lib/db'
import TtsCache from '../lib/models/TtsCache'
import { activeBackend } from '../lib/audioStore'

const MB = 1024 * 1024

async function main() {
  await connectDB()

  const [agg] = await TtsCache.aggregate([
    {
      $group: {
        _id: null,
        clips: { $sum: 1 },
        bytes: { $sum: '$bytes' },
        hits: { $sum: '$hits' },
        oldest: { $min: '$createdAt' },
      },
    },
  ])

  if (!agg?.clips) {
    console.log('\nCache is empty. Run: npm run warm-tts -- fr\n')
    await mongoose.disconnect()
    return
  }

  // Every hit beyond the first on a clip is a generation avoided.
  const saved = Math.max(0, agg.hits - agg.clips)
  const reuse = agg.clips ? (agg.hits / agg.clips) : 0

  // Where the bytes physically sit matters for cost: rows holding a `url` cost
  // the database almost nothing, rows holding `audio` sit inside your Atlas quota.
  const onCdn = await TtsCache.countDocuments({ url: { $exists: true, $ne: null } })
  const inDb = agg.clips - onCdn

  console.log('\nExpressive TTS cache')
  console.log(`  backend          ${activeBackend()}`)
  console.log(`  on CDN / in DB   ${onCdn} / ${inDb}`)
  console.log(`  clips stored     ${agg.clips}`)
  console.log(`  total size       ${(agg.bytes / MB).toFixed(1)} MB  (avg ${Math.round(agg.bytes / agg.clips / 1024)} KB/clip)`)
  console.log(`  total plays      ${agg.hits}`)
  console.log(`  generations saved ${saved}   (${reuse.toFixed(1)}x reuse per clip)`)
  if (agg.oldest) console.log(`  oldest entry     ${new Date(agg.oldest).toISOString().slice(0, 10)}`)

  const byStyle = await TtsCache.aggregate([
    { $group: { _id: { style: '$style', lang: '$lang' }, clips: { $sum: 1 }, bytes: { $sum: '$bytes' }, hits: { $sum: '$hits' } } },
    { $sort: { bytes: -1 } },
  ])
  if (byStyle.length) {
    console.log('\n  by style / language')
    for (const r of byStyle) {
      const style = r._id.style || '(unset)'
      const lang = r._id.lang || '(unset)'
      console.log(`    ${String(style).padEnd(15)} ${String(lang).padEnd(7)} ${String(r.clips).padStart(5)} clips  ${(r.bytes / MB).toFixed(1).padStart(6)} MB  ${r.hits} plays`)
    }
  }

  const cold = await TtsCache.countDocuments({ hits: { $lte: 1 } })
  console.log(`\n  never re-played  ${cold} clips (generated but only heard once)\n`)

  await mongoose.disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
