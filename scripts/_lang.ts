/**
 * Shared language resolution for the seed scripts. Each seeder takes the target
 * language as its first CLI arg (defaulting to French so existing commands keep
 * working), and maps the ISO code to its data/<dir> folder.
 *
 *     npm run seed            # French (default)
 *     npm run seed -- es      # Spanish
 */
export const LANG_DIRS: Record<string, string> = {
  fr: 'french',
  es: 'spanish',
  de: 'german',
  it: 'italian',
  pt: 'portuguese',
}

export function resolveLang(): { lang: string; dir: string } {
  const lang = (process.argv[2] || 'fr').toLowerCase()
  const dir = LANG_DIRS[lang]
  if (!dir) {
    throw new Error(`Unknown language "${lang}". Known: ${Object.keys(LANG_DIRS).join(', ')}`)
  }
  return { lang, dir }
}
