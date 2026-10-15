# Langi — AI-assisted spaced-repetition language learning

Langi is a standalone Next.js 16 app that teaches languages (French first) with a 5-box **Leitner
spaced-repetition system**, an AI tutor (Mistral + Gemini), conversation & sentence practice, browser
TTS/STT, a CEFR placement test, and a curated YouTube learning feed.

It is a sibling of the Scrappey `platform/` app: it **reuses the same Supabase auth** (shared accounts)
but stores its data in a **separate MongoDB database** (`langi`). There is **no admin-approval gate** —
any logged-in Supabase user can learn.

## Stack
- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4
- MongoDB + Mongoose (separate `langi` database)
- Supabase Auth (`@supabase/ssr`) — route protection in `proxy.ts`
- AI: Mistral (`mistral-small-latest`) + Gemini (`gemini-2.5-flash-lite`) cascade — cheapest first,
  with Mongo-persisted 429 cooldown (`lib/ai.ts`)
- Web Speech API for TTS/STT (`lib/speech.ts`) — Chromium-best, graceful text-first fallback; **offline
  dictation** falls back to on-device Vosk (`lib/voskStt.ts`)
- Expressive read-aloud: Gemini TTS **model cascade** (`lib/expressiveTts.ts`) — the free tier meters
  each TTS model separately, so a model that hits its cap is parked (Mongo-persisted cooldown) and the
  next one takes over; only when all are walled does audio drop to the browser voice.
  Check quota any time with `npm run tts-quota` (add `-- --dry` to skip the live probe)
- **Installable PWA** with true offline flashcards (see "Offline & install" below)

## Setup

```bash
cd langi
npm install
npm run seed     # seeds French: 15 decks (760 cards, A1→B2) + 24 placement questions
npm run dev      # http://localhost:3001
```

`.env.local` is already populated (shared Supabase + AI keys, `langi` Mongo database). To enable the
**Videos** tab, add a YouTube Data API v3 key:

```
YOUTUBE_API_KEY=your_key_here
```

Until then `/videos` shows a graceful empty state.

## Features / routes
- `/placement` — adaptive CEFR test (A1→C2) → sets your level
- `/learn` — dashboard: due counts, streak, memory distribution, decks by level
- `/learn/review/[deckId]` — SRS review (`all` = global queue): type the translation, hear it (TTS),
  speak it (STT); per-card AI **example** and **multiple-choice** assist
- `/chat` — Langi tutor: French conversation on a random/chosen topic, or grammar Q&A; with corrections + voice
- `/sentences` — translate an AI prompt into French and get a scored critique + model answer
- `/videos` — curated learning videos: casual → lessons → classes → creators (needs `YOUTUBE_API_KEY`)
- `/progress` — level, streak, accuracy, box distribution, activity
- `/learn/level-up` — short test on the next CEFR level (grammar bank + that level's deck vocab, no AI);
  pass 70% overall and 60% per section to move up, 24h cooldown after a miss
- `/league` — weekly XP leaderboard (same-language learners, or friends added by 6-char friend code)

### Learning loops
- **Tap any word** in stories, tutor chat and dictation to see its meaning, then save it to *Saved words*.
  Lookups are **database-first** (`lib/wordLookup.ts`): lexicon → curated deck cards (article-aware) →
  conjugation tables (`lib/lemma.ts`, e.g. "sommes" → être) → AI only on a miss. Hits are cached in the lexicon.
- **Saved words remember their source** — a video timestamp or story — and the review card links back to it.
- **SRS** keeps growing intervals past box 5 (16d → 40d → 100d …, capped at a year) so known words fade out.
- **Grammar interleaving**: every 8 flashcards, one due grammar question is slipped into the review session.
- **Mistake-aware AI**: recent unresolved mistakes steer the tutor and sentence prompts toward weak spots.
- **Role-play goals**: each scenario has 3 goals; ending the scene gives a scored debrief with useful phrases.
- **Shadowing**: in any story, hear a sentence and repeat it for a per-word pronunciation score.
- **Video study bar**: replay 5s, 0.5×/0.75× speed, A–B loop, and "Words from this video" jump-back chips.
- **Weekly digest** push on Sunday (sent by the same hourly `/api/cron/reminders` sweep).

## Offline & install

Langi is an installable PWA (`app/manifest.webmanifest`, service worker in `public/sw.js`). Once a
learner has opened a screen online, the service worker caches it so it boots offline; **flashcard review
runs fully offline** — due cards (with answers + tolerances) are cached in IndexedDB (`lib/offlineCards.ts`),
graded on-device with the same pure SRS logic (`lib/srs-core.ts`), and each answer is queued
(`lib/offlineQueue.ts`) to be re-graded server-side on reconnect. **TTS** uses the device's built-in
voices (already offline). AI (tutor/stories) and videos stay online by design.

### Offline dictation (STT) models — hosting

Speaking answers offline uses **Vosk small models (~40 MB per language)**, downloaded only when the
learner opts in (a one-tap prompt after install), then cached in the browser forever. The download URL
is controlled by one env var:

```
NEXT_PUBLIC_STT_MODEL_BASE=<base-url-serving-<file>.tar.gz>
```

Unset → it uses a community model host (fine for dev). **For production, self-host the archives** —
don't commit them (they're gitignored) and don't bake them into the deployment.

- **On Vercel → use a PUBLIC Vercel Blob store** (object storage, public + CORS CDN; keeps the
  deployment tiny). Two upload paths depending on whether you can get the store's read-write token:
  - **Local upload** (if you can read the RW token): `vercel env pull .env.local` then
    `npm run upload-stt-models` — uploads every archive and prints the `NEXT_PUBLIC_STT_MODEL_BASE=…`
    to set. Also works with `VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID` if OIDC is enabled for Development.
  - **Deployment upload** (if the RW token is *Sensitive*/unretrievable and dev-OIDC is off): deploy,
    then as an admin hit **`GET /api/admin/stt-upload`** ([app/api/admin/stt-upload/route.ts](app/api/admin/stt-upload/route.ts)).
    It runs in the deployment (where Vercel injects a production OIDC token), streams each model into the
    public store, is idempotent, and returns the `NEXT_PUBLIC_STT_MODEL_BASE` to set. Add `?lang=fr` to
    do one language if `all` times out. The store id defaults to the app's; override with
    `STT_BLOB_STORE_ID`. Set `NEXT_PUBLIC_STT_MODEL_BASE` in your Vercel project env (all environments),
    then redeploy so the client picks it up.
- **Any CORS bucket** (Cloudflare R2, S3, Backblaze) works too — upload the `*.tar.gz` files and point
  `NEXT_PUBLIC_STT_MODEL_BASE` at them.
- **Same-origin / VPS**: `npm run fetch-stt-models` downloads them into `public/vosk/`, then set
  `NEXT_PUBLIC_STT_MODEL_BASE=/vosk`. (Not recommended on Vercel — inflates every build/deploy.)

## Key design notes
- **Leitner SRS** (`lib/srs-core.ts`, `lib/srs.ts`): boxes 1–5, intervals `[1,3,7,16]` days; a wrong
  answer drops to box 1 with a **10-minute relearn step** (not "now"), and the review UI re-queues a
  failed card up to 3×/session so a session always terminates.
- **Answer tolerance** is per deck/card: `lenient` ignores accents + a leading article; `strict` keeps
  gender-bearing articles (`le chat` ≠ `la chat`).
- **Backup Gemini key**: set `GEMINI_API_KEY_2` (from a *different* Google Cloud project — free-tier quota is per project).
  Chat tries it after the primary Gemini key; expressive TTS tries every model on the primary key, then on the backup.
- **AI rate limiting** (`lib/ratelimit.ts`): per-user 30/min + 300/day on every external-AI route.
- **Chat history** is capped at the last 50 messages; only the last ~10 are sent to the model.

## Dev scripts
- `npm run seed` — (re)seed French content (idempotent; never wipes AI-enriched fields)
- `npm test` — Vitest unit tests for the pure modules (SRS, pronunciation, lemmas, level-up, league, weekly digest) in `tests/`
- `npx tsx scripts/verify-ai.ts` — smoke-test the live Mistral/Gemini backends
- `npx tsx scripts/e2e-smoke.ts` — full authenticated end-to-end test against a running dev server (`E2E_BASE=http://localhost:3002` to target another port)
- `npm run import-tatoeba` — (optional) import open Tatoeba en–fr sentence pairs for richer examples
- `npm run upload-stt-models` — upload offline-STT (Vosk) models to Vercel Blob (see "Offline & install")
- `npm run fetch-stt-models` — download offline-STT models into `public/vosk/` for same-origin hosting
