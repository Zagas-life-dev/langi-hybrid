import { describe, expect, it } from 'vitest'
import { parseServiceAccount } from '@/lib/firebase/credentials'

const key = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
const json = JSON.stringify({ project_id: 'demo', client_email: 'a@demo.iam.gserviceaccount.com', private_key: key })

describe('parseServiceAccount', () => {
  it('reads the downloaded JSON', () => {
    expect(parseServiceAccount(json)).toEqual({ projectId: 'demo', clientEmail: 'a@demo.iam.gserviceaccount.com', privateKey: key })
  })

  it('reads base64 JSON', () => {
    expect(parseServiceAccount(Buffer.from(json).toString('base64'))?.projectId).toBe('demo')
  })

  it('restores newlines that an env file escaped', () => {
    const escaped = JSON.stringify({ project_id: 'demo', client_email: 'a@b.c', private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----' })
    expect(parseServiceAccount(escaped)?.privateKey).toContain('\nabc\n')
  })

  it('returns null for empty, junk and incomplete keys', () => {
    expect(parseServiceAccount(undefined)).toBeNull()
    expect(parseServiceAccount('')).toBeNull()
    expect(parseServiceAccount('not json at all')).toBeNull()
    expect(parseServiceAccount(JSON.stringify({ project_id: 'x' }))).toBeNull()
  })
})
