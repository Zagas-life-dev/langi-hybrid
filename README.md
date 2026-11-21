# Langi Hybrid

An AI language-learning web app that **thinks on your device first**. Built for **#BuildHybridAI 2026**
(Chrome + Gemini Nano + Firebase AI Logic).

Langi teaches French, Spanish, Yoruba, Igbo and Hausa with a 5-box Leitner spaced-repetition system. Every AI
feature (tutor chat, sentence building, live correction, tap-to-explain, dictation, story generation, review
answer checking) runs through **Firebase AI Logic hybrid inference**: Gemini Nano on the device when Chrome
has it, Gemini in the cloud when it does not. Languages Nano cannot handle yet (Yoruba, Igbo, Hausa) are
routed to the cloud on purpose.

License: [Apache 2.0](LICENSE). Free to use.

## How the hybrid AI works
- `lib/hybrid/ai.ts` wraps `firebase/ai` (`getAI`, `getGenerativeModel`, `InferenceMode`). Every call goes
  through `runTask`.
- `lib/hybrid/tasks.ts` decides per task whether to prefer the device or the cloud (short text, a Nano-supported
  language and an available model go on-device).
- A **Hybrid HUD** shows where each answer ran (on-device or cloud), so the behaviour is visible.
- **Remote Config** can force cloud, hide the HUD or change which tasks run on-device, live, without a deploy.
- **App Check** (reCAPTCHA Enterprise) protects the Firebase AI Logic calls.
- Offline: a service worker, IndexedDB card packs, an offline review queue and an offline chat queue.

## Stack
Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Firebase (AI Logic, App Check,
Remote Config, Auth, Firestore), Vitest.

## Run it locally
Requirements: Node 20+, a Firebase project, Chrome (for Gemini Nano, see below).

```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
npm run seed                   # French decks + placement questions into Firestore
npm run dev                    # http://localhost:3001
npm test                       # unit tests
```

### Firebase setup
1. Create a Firebase project. Enable **Authentication** (Email/Password and Google), **Firestore**,
   **Firebase AI Logic** (Gemini Developer API), **App Check** and **Remote Config**.
2. Add a Web app and copy its config into the `NEXT_PUBLIC_FIREBASE_*` values in `.env.local`.
3. Create a service-account key (Project settings, Service accounts) and put it in `FIREBASE_SERVICE_ACCOUNT`
   as one line of JSON or base64. **Never commit it.** `.env.local` is git-ignored.
4. Publish `remoteconfig.template.json` as your Remote Config template (optional).
5. For App Check on `localhost`, register a debug token and set `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN`.

### Gemini Nano in Chrome
Use a recent desktop Chrome with the Prompt API available (`chrome://flags/#prompt-api-for-gemini-nano`,
`#optimization-guide-on-device-model`). Without it the app still works: the same calls fall back to the cloud.

### Seeding other languages
```bash
npm run seed -- es                       # Spanish
npx tsx --env-file=.env.local scripts/seed.ts yo   # Yoruba (after building the deck files, see below)
npx tsx --env-file=.env.local scripts/seed-placement.ts yo
```
The Yoruba, Igbo and Hausa decks are **not in this repository**: they are built from the MAFAND-MT and
MENYO-20k parallel corpora, which are licensed CC BY-NC 4.0 and so are not redistributed here. To rebuild them,
download [MAFAND-MT](https://github.com/masakhane-io/lafand-mt) into `data/african/mafand/` and
[MENYO-20k](https://github.com/uds-lsv/menyo-20k_MT) into `data/african/menyo20k/`, then run
`node scripts/build-ng-decks.mjs` and `node scripts/build-ng-placement.mjs`.

## Firestore free plan
Firestore's free plan allows 50,000 reads and 20,000 writes a day. The data layer (`lib/db/`) is built to stay
well under that: cached static content, no write on user lookup, count queries for totals. In development the
server prints a running `[firestore] N reads, N writes` line.

## Project layout
- `app/` pages and API routes; `components/` UI
- `lib/hybrid/` hybrid AI wrapper, task routing, HUD, Remote Config, device model handling
- `lib/db/` small Firestore data layer; `lib/models/` data models
- `scripts/` seeders, deck builders and live self-tests; `data/` curated decks
- `tests/` Vitest suites

## Built during the hackathon
The hybrid AI layer, the Firestore and Firebase Auth migration, offline chat, the Hybrid HUD, Remote Config
routing and the African-language content were all built for #BuildHybridAI 2026. The base app (spaced-repetition
decks, French and Spanish content, videos feed) was an existing project that was adapted for this entry.
