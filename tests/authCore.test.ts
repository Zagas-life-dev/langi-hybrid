import { describe, expect, it } from 'vitest'
import { authErrorMessage, sessionLooksLive } from '@/lib/firebase/authCore'

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (exp: number) => `${b64url({ alg: 'RS256' })}.${b64url({ exp })}.sig`

describe('authErrorMessage', () => {
  it('explains the common cases in plain words', () => {
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe('Wrong email or password.')
    expect(authErrorMessage({ code: 'auth/email-already-in-use' })).toContain('already exists')
    expect(authErrorMessage({ code: 'auth/weak-password' })).toContain('8 characters')
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toContain('No connection')
    expect(authErrorMessage({ code: 'auth/popup-blocked' })).toContain('pop-ups')
  })

  it('says nothing when the learner just closed the Google window', () => {
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toBe('')
    expect(authErrorMessage({ code: 'auth/cancelled-popup-request' })).toBe('')
  })

  it('points to the console fix for setup mistakes', () => {
    expect(authErrorMessage({ code: 'auth/unauthorized-domain' })).toContain('Authorized domains')
    expect(authErrorMessage({ code: 'auth/operation-not-allowed' })).toContain('Sign-in method')
  })

  it('hides raw SDK text but keeps our own messages', () => {
    expect(authErrorMessage({ message: 'Firebase: Error (auth/whatever).' })).toBe('Something went wrong. Try again.')
    expect(authErrorMessage(new Error('Could not start your session'))).toBe('Could not start your session')
    expect(authErrorMessage(undefined)).toBe('Something went wrong. Try again.')
  })
})

describe('sessionLooksLive', () => {
  const now = 1_700_000_000_000
  it('accepts an unexpired token', () => {
    expect(sessionLooksLive(jwt(now / 1000 + 3600), now)).toBe(true)
  })
  it('rejects expired, malformed and missing cookies', () => {
    expect(sessionLooksLive(jwt(now / 1000 - 10), now)).toBe(false)
    expect(sessionLooksLive('garbage', now)).toBe(false)
    expect(sessionLooksLive('a.b.c', now)).toBe(false)
    expect(sessionLooksLive(undefined, now)).toBe(false)
  })
})
