// Firebase Admin: the server's door to Firestore and Auth. Server-only (the key must never reach the browser).
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { parseServiceAccount } from './credentials'

let app: App | null = null
let db: Firestore | null = null

/** True when the service-account key is set, so callers can show a clear setup message instead of crashing. */
export function adminConfigured(): boolean {
  return parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT) !== null
}

function adminApp(): App {
  if (app) return app
  const existing = getApps()[0]
  if (existing) return (app = existing)
  const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT)
  if (!sa) {
    throw new Error('Firebase Admin is not configured: set FIREBASE_SERVICE_ACCOUNT in .env.local (see .env.example)')
  }
  return (app = initializeApp({ credential: cert(sa), projectId: sa.projectId }))
}

export function adminAuth(): Auth {
  return getAuth(adminApp())
}

export function adminDb(): Firestore {
  if (db) return db
  db = getFirestore(adminApp())
  // Optional fields left undefined are simply not written, like Mongoose did.
  db.settings({ ignoreUndefinedProperties: true })
  return db
}
