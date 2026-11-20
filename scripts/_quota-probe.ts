/** One tiny Firestore read, to tell whether today's free quota is spent. Run: npx tsx --env-file=.env.local scripts/_quota-probe.ts */
import { adminDb } from '../lib/firebase/admin'

async function main() {
  try {
    await adminDb().collection('languages').limit(1).get()
    console.log('Firestore answers: quota is available.')
  } catch (e) {
    const err = e as { code?: number; details?: string }
    console.log(err.code === 8 ? 'Quota is still exhausted for today (RESOURCE_EXHAUSTED).' : `Other error: ${err.details ?? String(e)}`)
  }
  process.exit(0)
}
main()
