// Pure parsing of the Firebase Admin service-account credential (no SDK imports, unit-testable).
// The key is a SECRET. It lives only in .env.local and the hosting provider's environment, never in git.
// Accepted forms of FIREBASE_SERVICE_ACCOUNT:
//   - the downloaded JSON file's contents on one line, or
//   - that same JSON base64-encoded (easier to paste into hosting dashboards).

export interface ServiceAccount {
  projectId: string
  clientEmail: string
  privateKey: string
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw || !raw.trim()) return null
  let text = raw.trim()
  if (!text.startsWith('{')) {
    try { text = Buffer.from(text, 'base64').toString('utf8') } catch { return null }
  }
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    const projectId = String(j.project_id ?? j.projectId ?? '')
    const clientEmail = String(j.client_email ?? j.clientEmail ?? '')
    // Env files often store the key with literal "\n" sequences: restore real newlines.
    const privateKey = String(j.private_key ?? j.privateKey ?? '').replace(/\\n/g, '\n')
    if (!projectId || !clientEmail || !privateKey.includes('BEGIN PRIVATE KEY')) return null
    return { projectId, clientEmail, privateKey }
  } catch {
    return null
  }
}
