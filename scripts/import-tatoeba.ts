/**
 * OPTIONAL: enrich seeded cards with real example sentences from a Tatoeba
 * <target>–English sentence-pair export (CC-BY 2.0 FR).
 *
 * 1. Download "Sentence pairs in <Language>-English" from https://tatoeba.org/downloads
 * 2. Save it as  langi/data/tatoeba/<lang>-en.tsv  (e.g. fr-en.tsv, es-en.tsv)
 *    (tab-separated: <id>\t<target>\t<en_id>\t<english> per line)
 * 3. Run:  npm run import-tatoeba            # French (default)
 *          npm run import-tatoeba -- es      # Spanish
 *
 * For each card that has no example yet, the first target-language sentence
 * containing the card's term (as a whole word) is attached as
 * exampleSentence/exampleTranslation. Idempotent and safe: it never overwrites
 * an existing example. Does nothing if the dump file is absent.
 */
import * as dotenv from 'dotenv'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import mongoose from 'mongoose'
import Card from '../lib/models/Card'
import { resolveLang } from './_lang'

dotenv.config({ path: '.env.local' })

const { lang: LANG } = resolveLang()

// Leading articles to strip so e.g. "le chat"/"el gato" matches the bare noun
// in a sentence. Superset across the supported languages — harmless overlap.
const ARTICLES = /^(le|la|les|l'|un|une|des|du|de|el|los|las|unos|unas|il|lo|gli|der|die|das|o|os|as)\s+/i

function termCore(term: string): string {
  return term.replace(ARTICLES, '').trim().toLowerCase()
}

async function main() {
  const file = path.join(process.cwd(), 'data', 'tatoeba', `${LANG}-en.tsv`)
  if (!existsSync(file)) {
    console.log(`No dump at ${file} — nothing to import. See the header of this script for setup.`)
    return
  }
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')
  await mongoose.connect(uri)

  const cards = await Card.find({ languageCode: LANG, $or: [{ exampleSentence: { $exists: false } }, { exampleSentence: '' }] })
  console.log(`${cards.length} cards need an example.`)
  // Map searchable term-core -> cards still needing an example.
  const pending = new Map<string, typeof cards>()
  for (const c of cards) {
    const key = termCore(c.term)
    if (!key) continue
    if (!pending.has(key)) pending.set(key, [])
    pending.get(key)!.push(c)
  }

  const lines = readFileSync(file, 'utf8').split('\n')
  let filled = 0
  for (const line of lines) {
    if (!pending.size) break
    const cols = line.split('\t')
    if (cols.length < 4) continue
    const target = cols[1]?.trim()
    const en = cols[3]?.trim()
    if (!target || !en) continue
    const lower = ' ' + target.toLowerCase().replace(/[^\p{L}\s'-]/gu, ' ') + ' '
    for (const [key, list] of pending) {
      if (!list.length) { pending.delete(key); continue }
      // whole-word-ish containment
      if (lower.includes(' ' + key + ' ') || lower.includes(" " + key + "'")) {
        const card = list.shift()!
        card.exampleSentence = target
        card.exampleTranslation = en
        await card.save()
        filled++
        if (!list.length) pending.delete(key)
      }
    }
  }

  console.log(`✓ Imported ${filled} example sentences from Tatoeba.`)
  await mongoose.disconnect()
}

main().catch((e) => { console.error('Import failed:', e); process.exit(1) })
