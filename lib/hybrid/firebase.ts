'use client'
// Firebase app + App Check + AI Logic, created once in the browser.
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai'

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}
const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY

export function firebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId)
}

let ai: AI | null = null

/** The one Firebase app for this page (sign-in, Remote Config and AI Logic all share it). */
export function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfigured()) {
    throw new Error('Firebase is not configured: set NEXT_PUBLIC_FIREBASE_* in .env.local')
  }
  return getApps()[0] ?? initializeApp(config)
}

export function getHybridAI(): AI {
  if (ai) return ai
  const app: FirebaseApp = getFirebaseApp()

  // Local dev: App Check debug token. The console prints a token to register in
  // Firebase console > App Check > Manage debug tokens. Never enabled in production.
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname)
  if (isLocal) {
    ;(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN || true
  }
  if (recaptchaKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    })
  } else if (isLocal) {
    // No site key yet: debug mode exchanges the debug token and never asks this provider.
    initializeAppCheck(app, {
      provider: new CustomProvider({ getToken: () => Promise.reject(new Error('No App Check provider: set NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY')) }),
      isTokenAutoRefreshEnabled: true,
    })
  } else {
    console.warn('[hybrid] NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY missing: App Check off, AI Logic calls will be rejected')
  }

  ai = getAI(app, { backend: new GoogleAIBackend() })
  return ai
}

/** The same Firebase app (App Check already attached), for Remote Config and other services. */
export function getHybridApp(): FirebaseApp {
  getHybridAI() // initialises the app and App Check exactly once
  return getApps()[0]
}
