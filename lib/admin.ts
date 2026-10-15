// Admin gate for Langi. Admins can feature playlists as official courses. The
// allowlist lives in the env so granting access needs no DB migration.
//   LANGI_ADMIN_EMAILS=alice@example.com,bob@example.com
const ADMIN_EMAILS = (process.env.LANGI_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isAdmin(email?: string | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
