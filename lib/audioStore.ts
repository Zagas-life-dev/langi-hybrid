// ---------------------------------------------------------------------------
// Where generated speech audio physically lives.
//
// Two drivers behind one interface:
//
//   cloudinary — when credentials are present. The clip is uploaded once and
//                served to learners straight from Cloudinary's CDN. This is the
//                preferred path: audio never touches the database, never streams
//                through a serverless function, and the browser caches it for
//                free on replay.
//   mongo      — the fallback. Bytes live in the TtsCache document and are
//                streamed back by /api/tts. Works with zero configuration,
//                which is why it stays the default.
//
// The driver is chosen purely by whether Cloudinary env vars are set, so this
// can be switched on in production without a code change — and if Cloudinary is
// ever removed, everything keeps working on the Mongo path.
//
// Server-only: never import this from a client component.
// ---------------------------------------------------------------------------

/** Public ID namespace, so TTS clips are easy to find/purge in the console. */
const FOLDER = 'langi/tts'

export function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  )
}

export type AudioBackend = 'cloudinary' | 'mongo'

export function activeBackend(): AudioBackend {
  return cloudinaryConfigured() ? 'cloudinary' : 'mongo'
}

/**
 * Upload a clip and return its public CDN URL.
 *
 * `key` (the TTS cache hash) becomes the public_id, which makes uploads
 * idempotent: re-uploading the same content overwrites the same object rather
 * than accumulating duplicates, and the URL is stable and content-addressed.
 *
 * Note Cloudinary treats audio as `resource_type: 'video'` — that's their API,
 * not a mistake.
 */
export async function uploadAudio(key: string, audio: Buffer, mimeType: string): Promise<string> {
  const { v2: cloudinary } = await import('cloudinary')
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })

  const format = mimeType === 'audio/wav' ? 'wav' : 'mp3'

  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video', // Cloudinary's bucket for all audio + video
        public_id: `${FOLDER}/${key}`,
        format,
        overwrite: false,        // same key = same audio; no point re-writing
        unique_filename: false,  // keep the hash as the id, don't suffix it
        use_filename: false,
        invalidate: false,
      },
      (err, result) => {
        if (err) return reject(err instanceof Error ? err : new Error(String(err)))
        if (!result?.secure_url) return reject(new Error('Cloudinary returned no URL'))
        resolve(result.secure_url)
      }
    )
    stream.end(audio)
  })
}
