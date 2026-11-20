/**
 * Seed structured French grammar lessons from a REAL conjugation dataset.
 * Run from the langi/ root:
 *     npm run seed-grammar
 *
 * Conjugation forms come verbatim from data/french/lefff-conjugations.json — a
 * subset of the Apache-2.0 `french-verbs-lefff` dataset (LEFFF / RosaeNLG); see
 * the NOTICE beside it. The drills and explanation tables are therefore accurate
 * by construction rather than AI-generated. Every other FR_CATALOG topic (articles,
 * pronouns, syntax…) is hand-written in data/french/grammar-lessons.json.
 *
 * Idempotent: each lesson is upserted by slug, overwriting body + drills.
 */
import * as dotenv from 'dotenv'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import GrammarLesson from '../lib/models/GrammarLesson'
import { getCatalog } from '../lib/grammar'
import type { CefrLevel } from '../lib/models/LangiUser'

dotenv.config({ path: '.env.local' })

const LANG = 'fr'

// tense -> 6 person forms (je, tu, il, nous, vous, ils); K = participle table.
type Conj = Record<string, string[]>
type ConjData = Record<string, Conj>
const DATA: ConjData = JSON.parse(
  readFileSync(path.join(process.cwd(), 'data', 'french', 'lefff-conjugations.json'), 'utf8')
)

const SUBJ = ['je', 'tu', 'il', 'nous', 'vous', 'ils']
const SUBJ_CAP = ['Je', 'Tu', 'Il', 'Nous', 'Vous', 'Ils']
const EN_SUBJ = ['I', 'you', 'he', 'we', 'you', 'they']

function elides(form: string): boolean {
  return /^[aeiouhâêîôûéèàïü]/i.test(form)
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
// LEFFF lists the literary "je puis" first; learners need everyday "je peux".
const MODERN: Record<string, string> = { 'pouvoir/P/0': 'peux' }
function conj(verb: string, tense: string, i: number): string {
  const modern = MODERN[`${verb}/${tense}/${i}`]
  if (modern) return modern
  const e = DATA[verb]
  if (!e || !e[tense]) throw new Error(`missing ${tense} for "${verb}"`)
  const f = e[tense][i]
  if (!f || f === 'NA') throw new Error(`no ${tense}[${i}] for "${verb}"`)
  return f
}
const part = (verb: string, idx: number) => conj(verb, 'K', idx) // 0 m.sg, 1 m.pl, 2 f.sg, 3 f.pl

// "je suis" / "j'ai" — subject + form with elision.
function frLine(verb: string, tense: string, i: number): string {
  const f = conj(verb, tense, i)
  return i === 0 && elides(f) ? `j'${f}` : `${SUBJ[i]} ${f}`
}
// Full paradigm as a readable inline table for explanations.
function table(verb: string, tense: string): string {
  return SUBJ.map((_, i) => {
    try { return frLine(verb, tense, i) } catch { return null }
  }).filter(Boolean).join(' · ')
}

// English gloss helpers (only for verbs in this map — used for example pairs).
const GLOSS: Record<string, string> = {
  être: 'be', avoir: 'have', aller: 'go', faire: 'do', parler: 'speak', aimer: 'like',
  habiter: 'live', manger: 'eat', regarder: 'watch', travailler: 'work', donner: 'give',
  jouer: 'play', finir: 'finish', choisir: 'choose', vendre: 'sell', attendre: 'wait',
  répondre: 'answer', partir: 'leave', venir: 'come', vouloir: 'want', prendre: 'take',
  voir: 'see', dire: 'say', lire: 'read', écrire: 'write', boire: 'drink',
}
function enPresent(inf: string, i: number): string {
  const base = GLOSS[inf]
  if (!base) return ''
  if (base === 'be') return ['am', 'are', 'is', 'are', 'are', 'are'][i]
  if (base === 'have') return i === 2 ? 'has' : 'have'
  if (i === 2) {
    if (/(s|sh|ch|x|o)$/.test(base)) return base + 'es'
    if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies'
    return base + 's'
  }
  return base
}
function enLine(inf: string, tense: string, i: number): string {
  const base = GLOSS[inf]
  if (!base) return ''
  const s = EN_SUBJ[i]
  if (tense === 'P') return `${s} ${enPresent(inf, i)}`
  if (tense === 'I') return base === 'be' ? `${s} ${['was', 'were', 'was', 'were', 'were', 'were'][i]}` : `${s} used to ${base}`
  if (tense === 'F') return `${s} will ${base}`
  if (tense === 'C') return `${s} would ${base}`
  return ''
}
// Build {fr,en} example pairs for a verb's paradigm (skips persons we can't gloss).
function paradigmExamples(verb: string, tense: string, persons: number[]): { fr: string; en: string }[] {
  const out: { fr: string; en: string }[] = []
  for (const i of persons) {
    const en = enLine(verb, tense, i)
    if (!en) continue
    out.push({ fr: cap(frLine(verb, tense, i)), en: cap(en) })
  }
  return out
}

// --- Drill builders --------------------------------------------------------
type Drill = { prompt: string; answer: string; hint?: string }

function presentDrill(verb: string, i: number, hint?: string): Drill {
  const f = conj(verb, 'P', i)
  const subj = i === 0 && elides(f) ? `J'` : `${SUBJ_CAP[i]} `
  return { prompt: `${subj}___. (${verb})`, answer: f, hint }
}
function tenseDrill(verb: string, tense: string, i: number, tenseName: string): Drill {
  const f = conj(verb, tense, i)
  const subj = i === 0 && elides(f) ? `J'` : `${SUBJ_CAP[i]} `
  return { prompt: `${subj}___. (${verb}, ${tenseName})`, answer: f }
}
function pcAvoirDrill(verb: string, i: number): Drill {
  const aux = conj('avoir', 'P', i)
  const subj = i === 0 ? `J'` : `${SUBJ_CAP[i]} `
  return { prompt: `${subj}${aux} ___. (${verb})`, answer: part(verb, 0), hint: 'past participle' }
}
function pqpDrill(verb: string, i: number): Drill {
  const aux = conj('avoir', 'I', i)
  const subj = i === 0 ? `J'` : `${SUBJ_CAP[i]} `
  return { prompt: `${subj}${aux} ___. (${verb})`, answer: part(verb, 0), hint: 'past participle' }
}
// Explicit-subject être-passé-composé drill (tests participle agreement).
function pcEtreDrill(subjFr: string, etreI: number, verb: string, partIdx: number): Drill {
  const aux = conj('être', 'P', etreI)
  return { prompt: `${subjFr} ${aux} ___. (${verb})`, answer: part(verb, partIdx), hint: 'agree with the subject' }
}
function futurProcheDrill(i: number, complementInf: string): Drill {
  const subj = i === 0 ? `Je ` : `${SUBJ_CAP[i]} `
  return { prompt: `${subj}___ ${complementInf}. (aller — futur proche)`, answer: conj('aller', 'P', i) }
}
const REFL = ['me', 'te', 'se', 'nous', 'vous', 'se']
function reflexiveAnswer(i: number, form: string): string {
  const p = REFL[i]
  if ((p === 'me' || p === 'te' || p === 'se') && elides(form)) return `${p[0]}'${form}`
  return `${p} ${form}`
}
function reflexiveDrill(base: string, i: number): Drill {
  const inf = elides(base) ? `s'${base}` : `se ${base}`
  return { prompt: `${SUBJ_CAP[i]} ___. (${inf})`, answer: reflexiveAnswer(i, conj(base, 'P', i)) }
}
function subjonctifDrill(verb: string, i: number): Drill {
  const sq = ['que je', 'que tu', `qu'il`, 'que nous', 'que vous', `qu'ils`][i]
  return { prompt: `Il faut ${sq} ___. (${verb}, subjonctif)`, answer: conj(verb, 'S', i) }
}

// Present-tense blank inside a short sentence: "Je ___ nager. (savoir)".
// `rest` carries the sentence's own closing punctuation.
function ctxDrill(verb: string, i: number, rest: string, hint?: string): Drill {
  const f = conj(verb, 'P', i)
  const subj = i === 0 && elides(f) ? `J'` : `${SUBJ_CAP[i]} `
  return { prompt: `${subj}___ ${rest} (${verb})`, answer: f, hint }
}
// Imperative: only tu (1), nous (3) and vous (4) exist.
const IMP_WHO = ['', 'tu', '', 'nous', 'vous', '']
function imperativeDrill(verb: string, i: number, rest: string): Drill {
  return { prompt: `___ ${rest} (${verb}, ${IMP_WHO[i]})`, answer: conj(verb, 'Y', i), hint: 'imperative, no subject pronoun' }
}
function imperativeTable(verb: string): string {
  return [1, 3, 4].map((i) => conj(verb, 'Y', i)).join(' · ')
}
// Futur antérieur: avoir/être in the futur simple + past participle.
// `subjFr` overrides the pronoun so être-agreement drills can use elle/elles.
function futAntDrill(verb: string, i: number, partIdx = 0, aux: 'avoir' | 'être' = 'avoir', subjFr?: string): Drill {
  const a = conj(aux, 'F', i)
  const subj = subjFr ? `${subjFr} ` : i === 0 && elides(a) ? `j'` : `${SUBJ[i]} `
  return {
    prompt: `Quand ${subj}${a} ___, on en parlera. (${verb})`,
    answer: part(verb, partIdx),
    hint: aux === 'être' ? 'agree with the subject' : 'past participle',
  }
}
// Recent past: venir (present) + de + infinitive.
function venirDeDrill(i: number, inf: string): Drill {
  const subj = i === 0 ? 'Je ' : `${SUBJ_CAP[i]} `
  const de = elides(inf) ? `d'${inf}` : `de ${inf}`
  return { prompt: `${subj}___ ${de}. (venir — passé récent)`, answer: conj('venir', 'P', i), hint: 'just did' }
}

// --- Lessons ---------------------------------------------------------------
interface SeedLesson {
  slug: string
  level: CefrLevel
  title: string
  topic: string
  order: number
  build: () => { summary: string; explanation: string; examples: { fr: string; en: string }[]; drills: Drill[] }
}

const LESSONS: SeedLesson[] = [
  {
    slug: 'fr-a1-etre', level: 'A1', title: 'The verb être (to be)', topic: 'verbs', order: 0,
    build: () => ({
      summary: 'être is the irregular verb “to be”, used for identity, description and states.',
      explanation:
        `être (“to be”) is one of the two most important French verbs. It is irregular, so learn its present tense by heart:\n\n` +
        `Présent: ${table('être', 'P')}.\n\n` +
        `Use être to say who or what someone is (Je suis étudiant), to describe (Elle est grande), and as the auxiliary for many passé composé verbs.`,
      examples: paradigmExamples('être', 'P', [0, 1, 2, 3, 4, 5]),
      drills: [0, 1, 2, 3, 4, 5].map((i) => presentDrill('être', i)),
    }),
  },
  {
    slug: 'fr-a1-avoir', level: 'A1', title: 'The verb avoir (to have)', topic: 'verbs', order: 1,
    build: () => ({
      summary: 'avoir means “to have” and powers most of the passé composé.',
      explanation:
        `avoir (“to have”) is irregular and extremely common. Present tense:\n\n` +
        `Présent: ${table('avoir', 'P')}.\n\n` +
        `Besides possession (J'ai un livre), avoir appears in fixed expressions of state — avoir faim (to be hungry), avoir soif, avoir 20 ans (to be 20) — and is the auxiliary for most passé composé verbs.`,
      examples: paradigmExamples('avoir', 'P', [0, 1, 2, 3, 4, 5]),
      drills: [0, 1, 2, 3, 4, 5].map((i) => presentDrill('avoir', i)),
    }),
  },
  {
    slug: 'fr-a1-er-verbs', level: 'A1', title: 'Regular -er verbs (present)', topic: 'verbs', order: 4,
    build: () => ({
      summary: 'Most French verbs end in -er and share one set of present-tense endings.',
      explanation:
        `Verbs ending in -er (about 90% of all French verbs) are regular. Drop the -er and add: -e, -es, -e, -ons, -ez, -ent.\n\n` +
        `parler (to speak): ${table('parler', 'P')}.\n\n` +
        `The same endings work for aimer, habiter, regarder, travailler and thousands more. Note that -e, -es and -ent all sound the same.`,
      examples: [
        ...paradigmExamples('parler', 'P', [0, 3]),
        ...paradigmExamples('aimer', 'P', [0, 2]),
        ...paradigmExamples('habiter', 'P', [3]),
      ],
      drills: [
        presentDrill('parler', 1), presentDrill('aimer', 0), presentDrill('habiter', 2),
        presentDrill('regarder', 3), presentDrill('travailler', 5), presentDrill('jouer', 4),
        presentDrill('manger', 0),
      ],
    }),
  },
  {
    slug: 'fr-a2-ir-re-verbs', level: 'A2', title: 'Regular -ir and -re verbs', topic: 'verbs', order: 12,
    build: () => ({
      summary: 'Regular -ir and -re verbs each follow their own present-tense pattern.',
      explanation:
        `Regular -ir verbs (finir-type) add -is, -is, -it, -issons, -issez, -issent:\n\n` +
        `finir (to finish): ${table('finir', 'P')}.\n\n` +
        `Regular -re verbs drop -re and add -s, -s, –, -ons, -ez, -ent (the il/elle form has no ending):\n\n` +
        `vendre (to sell): ${table('vendre', 'P')}.`,
      examples: [
        ...paradigmExamples('finir', 'P', [0, 3]),
        ...paradigmExamples('vendre', 'P', [0, 2]),
        ...paradigmExamples('attendre', 'P', [4]),
      ],
      drills: [
        presentDrill('finir', 1), presentDrill('choisir', 3), presentDrill('réussir', 5),
        presentDrill('vendre', 0), presentDrill('attendre', 2), presentDrill('répondre', 4),
        presentDrill('entendre', 1),
      ],
    }),
  },
  {
    slug: 'fr-a2-passe-compose-avoir', level: 'A2', title: 'Passé composé with avoir', topic: 'verbs', order: 8,
    build: () => ({
      summary: 'The passé composé = avoir (present) + past participle, for completed past actions.',
      explanation:
        `The passé composé describes completed past actions. For most verbs: avoir in the present + the past participle.\n\n` +
        `Past participles: -er verbs → -é (manger → mangé), -ir verbs → -i (finir → fini), -re verbs → -u (vendre → vendu).\n\n` +
        `Example: ${table('avoir', 'P').split(' · ')[0]} mangé = I ate / I have eaten. With avoir the participle does NOT change for the subject.`,
      examples: [
        { fr: "J'ai mangé une pomme.", en: 'I ate an apple.' },
        { fr: 'Tu as fini le travail.', en: 'You finished the work.' },
        { fr: 'Nous avons vendu la voiture.', en: 'We sold the car.' },
      ],
      drills: [
        pcAvoirDrill('manger', 0), pcAvoirDrill('finir', 1), pcAvoirDrill('vendre', 3),
        pcAvoirDrill('regarder', 2), pcAvoirDrill('choisir', 4), pcAvoirDrill('attendre', 5),
      ],
    }),
  },
  {
    slug: 'fr-a2-passe-compose-etre', level: 'A2', title: 'Passé composé with être', topic: 'verbs', order: 9,
    build: () => ({
      summary: 'Movement/state verbs form the passé composé with être — and the participle agrees.',
      explanation:
        `A set of mostly movement verbs (aller, venir, partir, arriver, entrer, sortir, monter, descendre, rester, tomber, naître, mourir…) use être, not avoir.\n\n` +
        `With être the past participle AGREES with the subject: add -e for feminine, -s for plural. Il est allé · Elle est allée · Ils sont allés · Elles sont allées.\n\n` +
        `Reflexive verbs also take être in the passé composé.`,
      examples: [
        { fr: 'Il est allé au marché.', en: 'He went to the market.' },
        { fr: 'Elle est partie tôt.', en: 'She left early.' },
        { fr: 'Elles sont arrivées hier.', en: 'They (f.) arrived yesterday.' },
      ],
      drills: [
        pcEtreDrill('Il', 2, 'aller', 0),
        pcEtreDrill('Elle', 2, 'partir', 2),
        pcEtreDrill('Ils', 5, 'arriver', 1),
        pcEtreDrill('Elles', 5, 'rester', 3),
        pcEtreDrill('Nous', 3, 'venir', 1),
        pcEtreDrill('Elle', 2, 'monter', 2),
      ],
    }),
  },
  {
    slug: 'fr-a2-futur-proche', level: 'A2', title: 'Near future (aller + infinitive)', topic: 'verbs', order: 10,
    build: () => ({
      summary: 'The futur proche = aller (present) + an infinitive: “going to do”.',
      explanation:
        `To talk about the near future, use aller in the present + an infinitive — just like English “going to”.\n\n` +
        `aller (present): ${table('aller', 'P')}.\n\n` +
        `Je vais manger = I am going to eat. Nous allons voyager = We are going to travel. Only aller changes; the second verb stays in the infinitive.`,
      examples: [
        { fr: 'Je vais manger.', en: 'I am going to eat.' },
        { fr: 'Tu vas partir bientôt.', en: 'You are going to leave soon.' },
        { fr: 'Nous allons voyager.', en: 'We are going to travel.' },
      ],
      drills: [
        futurProcheDrill(0, 'manger'), futurProcheDrill(1, 'partir'), futurProcheDrill(2, 'travailler'),
        futurProcheDrill(3, 'voyager'), futurProcheDrill(4, 'étudier'), futurProcheDrill(5, 'arriver'),
      ],
    }),
  },
  {
    slug: 'fr-a2-reflexive', level: 'A2', title: 'Reflexive verbs', topic: 'verbs', order: 11,
    build: () => ({
      summary: 'Reflexive verbs carry a pronoun (me, te, se…) that matches the subject.',
      explanation:
        `Reflexive (pronominal) verbs describe actions done to oneself. They take an extra pronoun before the verb: me, te, se, nous, vous, se.\n\n` +
        `se laver (to wash oneself): ${SUBJ.map((s, i) => (i === 0 ? `je ${reflexiveAnswer(0, conj('laver', 'P', 0))}` : `${s} ${reflexiveAnswer(i, conj('laver', 'P', i))}`)).join(' · ')}.\n\n` +
        `Before a vowel, me/te/se shorten to m'/t'/s' — je m'appelle, tu t'amuses.`,
      examples: [
        { fr: "Je m'appelle Marie.", en: 'My name is Marie.' },
        { fr: 'Tu te lèves tôt.', en: 'You get up early.' },
        { fr: 'Nous nous couchons tard.', en: 'We go to bed late.' },
      ],
      drills: [
        reflexiveDrill('laver', 0), reflexiveDrill('lever', 1), reflexiveDrill('appeler', 0),
        reflexiveDrill('coucher', 3), reflexiveDrill('amuser', 1), reflexiveDrill('reposer', 5),
      ],
    }),
  },
  {
    slug: 'fr-a2-imparfait', level: 'A2', title: 'The imparfait', topic: 'verbs', order: 14,
    build: () => ({
      summary: 'The imparfait describes past habits, descriptions and ongoing background.',
      explanation:
        `The imparfait is the “background” past tense: habits, repeated actions, descriptions and states. Take the nous form of the present, drop -ons, and add -ais, -ais, -ait, -ions, -iez, -aient.\n\n` +
        `parler → ${table('parler', 'I')}.\n\n` +
        `Only être is irregular in the stem (j'étais…). Compare with the passé composé, which is for single, completed events.`,
      examples: [
        ...paradigmExamples('parler', 'I', [0, 2]),
        ...paradigmExamples('finir', 'I', [3]),
        { fr: "Quand j'étais petit…", en: 'When I was little…' },
      ],
      drills: [
        tenseDrill('parler', 'I', 0, 'imparfait'), tenseDrill('finir', 'I', 1, 'imparfait'),
        tenseDrill('avoir', 'I', 2, 'imparfait'), tenseDrill('être', 'I', 0, 'imparfait'),
        tenseDrill('faire', 'I', 3, 'imparfait'), tenseDrill('aller', 'I', 5, 'imparfait'),
      ],
    }),
  },
  {
    slug: 'fr-b1-futur-simple', level: 'B1', title: 'Futur simple', topic: 'verbs', order: 16,
    build: () => ({
      summary: 'The futur simple expresses what will happen, with endings on the infinitive.',
      explanation:
        `The futur simple says what WILL happen. For regular verbs, add the endings -ai, -as, -a, -ons, -ez, -ont to the infinitive (drop the final -e of -re verbs).\n\n` +
        `parler → ${table('parler', 'F')}.\n\n` +
        `Several common verbs have irregular stems: être → ser-, avoir → aur-, aller → ir-, faire → fer-, venir → viendr-. The endings stay the same.`,
      examples: [
        ...paradigmExamples('parler', 'F', [0, 1]),
        { fr: "J'irai en France.", en: 'I will go to France.' },
        { fr: 'Nous serons prêts.', en: 'We will be ready.' },
      ],
      drills: [
        tenseDrill('parler', 'F', 0, 'futur'), tenseDrill('finir', 'F', 1, 'futur'),
        tenseDrill('être', 'F', 2, 'futur'), tenseDrill('avoir', 'F', 3, 'futur'),
        tenseDrill('aller', 'F', 0, 'futur'), tenseDrill('faire', 'F', 5, 'futur'),
      ],
    }),
  },
  {
    slug: 'fr-b1-conditionnel', level: 'B1', title: 'Conditionnel présent', topic: 'verbs', order: 17,
    build: () => ({
      summary: 'The conditional expresses “would”, for politeness and hypotheses.',
      explanation:
        `The conditionnel présent means “would”. Use the SAME stem as the futur simple, but add the imparfait endings -ais, -ais, -ait, -ions, -iez, -aient.\n\n` +
        `aimer → ${table('aimer', 'C')}.\n\n` +
        `It softens requests (Je voudrais… = I would like…) and states hypotheticals (Si j'avais le temps, je voyagerais).`,
      examples: [
        { fr: 'Je voudrais un café.', en: 'I would like a coffee.' },
        { fr: 'Tu devrais dormir.', en: 'You should sleep.' },
        ...paradigmExamples('aimer', 'C', [3]),
      ],
      drills: [
        tenseDrill('vouloir', 'C', 0, 'conditionnel'), tenseDrill('aimer', 'C', 1, 'conditionnel'),
        tenseDrill('être', 'C', 2, 'conditionnel'), tenseDrill('avoir', 'C', 3, 'conditionnel'),
        tenseDrill('aller', 'C', 4, 'conditionnel'), tenseDrill('faire', 'C', 5, 'conditionnel'),
      ],
    }),
  },
  {
    slug: 'fr-b1-subjonctif', level: 'B1', title: 'Subjonctif présent (introduction)', topic: 'verbs', order: 18,
    build: () => ({
      summary: 'The subjunctive appears after expressions of necessity, wish and emotion.',
      explanation:
        `The subjonctif is a mood used after certain triggers — il faut que, vouloir que, bien que, pour que — to express necessity, will or emotion. Form it from the ils form of the present (drop -ent) + -e, -es, -e, -ions, -iez, -ent.\n\n` +
        `parler → ${table('parler', 'S')}.\n\n` +
        `être and avoir are irregular: que je sois…, que j'aie…. Trigger phrase: Il faut que je parte (I must leave).`,
      examples: [
        { fr: 'Il faut que je parte.', en: 'I have to leave.' },
        { fr: 'Je veux que tu sois là.', en: 'I want you to be there.' },
        { fr: "Il faut qu'il finisse.", en: 'He has to finish.' },
      ],
      drills: [
        subjonctifDrill('parler', 0), subjonctifDrill('finir', 1), subjonctifDrill('être', 2),
        subjonctifDrill('avoir', 0), subjonctifDrill('faire', 3), subjonctifDrill('aller', 5),
      ],
    }),
  },
  {
    slug: 'fr-b1-plus-que-parfait', level: 'B1', title: 'Plus-que-parfait', topic: 'verbs', order: 22,
    build: () => ({
      summary: 'The pluperfect (“had done”) describes an action before another past action.',
      explanation:
        `The plus-que-parfait expresses an action that happened BEFORE another past action — English “had done”. Form it like the passé composé but with the auxiliary in the imparfait: avoir/être (imparfait) + past participle.\n\n` +
        `avoir imparfait: ${table('avoir', 'I')}.\n\n` +
        `J'avais mangé avant de partir = I had eaten before leaving. Être-verbs still agree: elle était partie.`,
      examples: [
        { fr: "J'avais déjà mangé.", en: 'I had already eaten.' },
        { fr: 'Tu avais fini avant moi.', en: 'You had finished before me.' },
        { fr: 'Elle était partie.', en: 'She had left.' },
      ],
      drills: [
        pqpDrill('manger', 0), pqpDrill('finir', 1), pqpDrill('vendre', 2),
        pqpDrill('regarder', 3), pqpDrill('choisir', 4), pqpDrill('attendre', 5),
      ],
    }),
  },
  {
    slug: 'fr-a1-aller-faire', level: 'A1', title: 'The verbs aller & faire', topic: 'verbs', order: 0,
    build: () => ({
      summary: 'aller (to go) and faire (to do/make) are irregular and appear in almost every conversation.',
      explanation:
        `aller (“to go”) is irregular — only nous and vous look like the infinitive:\n\n` +
        `aller: ${table('aller', 'P')}.\n\n` +
        `Use it for movement (Je vais à Paris), to ask how someone is (Comment ça va ?), and with an infinitive for the near future (Je vais manger).\n\n` +
        `faire (“to do / to make”) is also irregular — watch vous faites, not “faisez”:\n\n` +
        `faire: ${table('faire', 'P')}.\n\n` +
        `faire builds many fixed expressions: faire les courses (to go shopping), faire la cuisine (to cook), faire du sport, and the weather — il fait beau, il fait froid.`,
      examples: [
        ...paradigmExamples('aller', 'P', [0, 2]),
        ...paradigmExamples('faire', 'P', [3]),
        { fr: 'Vous faites du sport ?', en: 'Do you do sport?' },
        { fr: 'Il fait beau aujourd’hui.', en: 'The weather is nice today.' },
        { fr: 'Ils vont au cinéma.', en: 'They are going to the cinema.' },
      ],
      drills: [
        ctxDrill('aller', 0, 'à la plage.'), ctxDrill('aller', 1, 'au travail ?'), ctxDrill('aller', 5, 'en France.'),
        ctxDrill('aller', 3, 'au marché.'), ctxDrill('faire', 0, 'la cuisine.'), ctxDrill('faire', 4, 'du sport ?', 'irregular vous form'),
        ctxDrill('faire', 5, 'les courses.'), ctxDrill('faire', 3, 'une promenade.'),
      ],
    }),
  },
  {
    slug: 'fr-a1-modals', level: 'A1', title: 'pouvoir, vouloir, devoir', topic: 'verbs', order: 0,
    build: () => ({
      summary: 'pouvoir (can), vouloir (want) and devoir (must) are followed by a verb in the infinitive.',
      explanation:
        `These three verbs express ability, wish and obligation. All three are irregular, and the verb that follows stays in the infinitive: Je peux venir. Tu veux manger ? Nous devons partir.\n\n` +
        `pouvoir (can / to be able): ${table('pouvoir', 'P')}.\n\n` +
        `vouloir (to want): ${table('vouloir', 'P')}.\n\n` +
        `devoir (must / to have to): ${table('devoir', 'P')}.\n\n` +
        `Notice the shared pattern: je/tu/il and ils use a different stem from nous/vous (peux / pouvons / peuvent). You may meet je puis in formal writing — it is the literary form of je peux. For a polite request, use the conditional: je voudrais (I would like), pourriez-vous… ? (could you…?). In a negative sentence, ne… pas goes around the modal: Je ne peux pas venir.`,
      examples: [
        { fr: 'Je peux venir demain.', en: 'I can come tomorrow.' },
        { fr: 'Tu veux un café ?', en: 'Do you want a coffee?' },
        { fr: 'Nous devons partir.', en: 'We have to leave.' },
        { fr: 'Ils ne peuvent pas sortir.', en: 'They can’t go out.' },
        { fr: 'Vous voulez manger ?', en: 'Do you want to eat?' },
      ],
      drills: [
        ctxDrill('pouvoir', 0, 'venir demain.'), ctxDrill('pouvoir', 1, 'm’aider ?'), ctxDrill('pouvoir', 5, 'partir.'),
        ctxDrill('vouloir', 0, 'un café.'), ctxDrill('vouloir', 4, 'manger ?'), ctxDrill('vouloir', 5, 'voyager.'),
        ctxDrill('devoir', 3, 'travailler.'), ctxDrill('devoir', 2, 'dormir.'),
      ],
    }),
  },
  {
    slug: 'fr-a2-venir-prendre', level: 'A2', title: 'venir & prendre (+ venir de)', topic: 'verbs', order: 0,
    build: () => ({
      summary: 'venir (to come) and prendre (to take) lead whole families of verbs, and venir de means “to have just”.',
      explanation:
        `venir (“to come”) changes its stem to vien- in the singular and vienn- in the ils form:\n\n` +
        `venir: ${table('venir', 'P')}.\n\n` +
        `The same pattern works for revenir (to come back), devenir (to become) and tenir (to hold): je tiens, ils tiennent.\n\n` +
        `prendre (“to take”) drops the d in the plural and doubles the n in the ils form:\n\n` +
        `prendre: ${table('prendre', 'P')}.\n\n` +
        `apprendre (to learn) and comprendre (to understand) follow it exactly: j'apprends, nous comprenons, ils comprennent.\n\n` +
        `Recent past — venir de + infinitive means “to have just done”: Je viens de manger = I have just eaten. Only venir is conjugated.`,
      examples: [
        ...paradigmExamples('venir', 'P', [0, 5]),
        ...paradigmExamples('prendre', 'P', [3]),
        { fr: 'Je viens de manger.', en: 'I have just eaten.' },
        { fr: 'Ils prennent le train.', en: 'They take the train.' },
        { fr: 'Elle devient médecin.', en: 'She is becoming a doctor.' },
      ],
      drills: [
        ctxDrill('venir', 1, 'avec nous ?'), ctxDrill('venir', 5, 'de Lyon.'), ctxDrill('venir', 3, 'ce soir.'),
        ctxDrill('prendre', 0, 'le bus.'), ctxDrill('prendre', 5, 'un taxi.', 'double n'), ctxDrill('prendre', 4, 'un café ?'),
        venirDeDrill(0, 'manger'), venirDeDrill(2, 'arriver'),
      ],
    }),
  },
  {
    slug: 'fr-a2-savoir-connaitre', level: 'A2', title: 'savoir vs connaître', topic: 'verbs', order: 0,
    build: () => ({
      summary: 'Both mean “to know”: savoir for facts and skills, connaître for people and places.',
      explanation:
        `French has two verbs for “to know”, and they are not interchangeable.\n\n` +
        `savoir — to know a fact, or how to do something. It is followed by an infinitive, que, or a question word: Je sais nager (I can swim). Tu sais où il habite ? Je sais qu'il est là.\n\n` +
        `savoir: ${table('savoir', 'P')}.\n\n` +
        `connaître — to know / be familiar with a person, place or thing. It is always followed by a noun: Je connais Marie. Tu connais Paris ? Il connaît ce film.\n\n` +
        `connaître: ${table('connaître', 'P')}.\n\n` +
        `Quick test: if a noun follows (a person, a city, a book), use connaître. If a verb, a clause or a question word follows, use savoir.`,
      examples: [
        { fr: 'Je sais nager.', en: 'I can swim.' },
        { fr: 'Tu connais Marie ?', en: 'Do you know Marie?' },
        { fr: 'Nous savons qu’il est malade.', en: 'We know he is ill.' },
        { fr: 'Ils connaissent bien Paris.', en: 'They know Paris well.' },
        { fr: 'Vous savez où est la gare ?', en: 'Do you know where the station is?' },
      ],
      drills: [
        ctxDrill('savoir', 0, 'nager.'), ctxDrill('connaître', 1, 'Marie ?'), ctxDrill('savoir', 4, 'où est la gare ?'),
        ctxDrill('connaître', 5, 'bien Paris.'), ctxDrill('savoir', 3, 'qu’il est malade.'), ctxDrill('connaître', 2, 'ce restaurant.'),
        ctxDrill('savoir', 5, 'cuisiner.'), ctxDrill('connaître', 0, 'son frère.'),
      ],
    }),
  },
  {
    slug: 'fr-a2-everyday-irregulars', level: 'A2', title: 'Everyday irregulars: dire, voir, mettre, lire, écrire, boire', topic: 'verbs', order: 0,
    build: () => ({
      summary: 'Six common irregular verbs, with their present tense and past participles.',
      explanation:
        `These verbs are too frequent to avoid, so learn them as a set.\n\n` +
        `dire (to say): ${table('dire', 'P')} — note vous dites, like vous faites and vous êtes.\n\n` +
        `voir (to see): ${table('voir', 'P')}.\n\n` +
        `mettre (to put / put on): ${table('mettre', 'P')}.\n\n` +
        `lire (to read): ${table('lire', 'P')} · écrire (to write): ${table('écrire', 'P')}.\n\n` +
        `boire (to drink): ${table('boire', 'P')}.\n\n` +
        `Past participles (for the passé composé with avoir): dire → ${part('dire', 0)}, voir → ${part('voir', 0)}, mettre → ${part('mettre', 0)}, lire → ${part('lire', 0)}, écrire → ${part('écrire', 0)}, boire → ${part('boire', 0)}.`,
      examples: [
        ...paradigmExamples('dire', 'P', [4]),
        ...paradigmExamples('voir', 'P', [3]),
        ...paradigmExamples('boire', 'P', [5]),
        { fr: "J'ai lu ce livre.", en: 'I read this book.' },
        { fr: 'Elle met son manteau.', en: 'She puts on her coat.' },
      ],
      drills: [
        ctxDrill('dire', 4, 'la vérité ?', 'irregular vous form'), ctxDrill('voir', 3, 'la mer.'), ctxDrill('mettre', 2, 'son manteau.'),
        ctxDrill('lire', 0, 'le journal.'), ctxDrill('écrire', 5, 'une lettre.'), ctxDrill('boire', 3, 'du thé.'),
        pcAvoirDrill('voir', 0), pcAvoirDrill('écrire', 1), pcAvoirDrill('boire', 2),
      ],
    }),
  },
  {
    slug: 'fr-a2-imperative', level: 'A2', title: 'The imperative (commands)', topic: 'verbs', order: 0,
    build: () => ({
      summary: 'The imperative gives orders and advice using the tu, nous and vous forms with no subject pronoun.',
      explanation:
        `To give an order, instruction or suggestion, take the present-tense tu, nous or vous form and drop the subject pronoun: Tu finis → Finis ! Nous partons → Partons ! (Let's leave!) Vous attendez → Attendez !\n\n` +
        `-er verbs (and aller) drop the final -s in the tu form: tu parles → ${conj('parler', 'Y', 1)} ! · tu vas → ${conj('aller', 'Y', 1)} !\n\n` +
        `parler: ${imperativeTable('parler')} · finir: ${imperativeTable('finir')} · prendre: ${imperativeTable('prendre')}.\n\n` +
        `Three verbs are irregular and borrow the subjunctive: être → ${imperativeTable('être')} · avoir → ${imperativeTable('avoir')} · savoir → ${imperativeTable('savoir')}.\n\n` +
        `For a negative command, put ne… pas around the verb: Ne parle pas ! N'attendez pas ! With pronouns, affirmative commands put them after the verb with a hyphen (Regarde-moi !), negative ones before it (Ne me regarde pas !).`,
      examples: [
        { fr: 'Parle plus fort !', en: 'Speak louder!' },
        { fr: 'Allons au parc !', en: 'Let’s go to the park!' },
        { fr: 'Soyez prudents.', en: 'Be careful.' },
        { fr: 'Ne mange pas trop vite !', en: 'Don’t eat too fast!' },
        { fr: 'Prenez la première rue à droite.', en: 'Take the first street on the right.' },
      ],
      drills: [
        imperativeDrill('parler', 1, 'plus fort !'), imperativeDrill('aller', 3, 'au parc !'), imperativeDrill('être', 4, 'prudents.'),
        imperativeDrill('finir', 1, 'tes devoirs !'), imperativeDrill('prendre', 4, 'la première rue à droite.'), imperativeDrill('avoir', 1, 'confiance !'),
        imperativeDrill('écouter', 4, 'bien !'), imperativeDrill('faire', 4, 'attention !'),
      ],
    }),
  },
  {
    slug: 'fr-b1-futur-anterieur', level: 'B1', title: 'Futur antérieur', topic: 'verbs', order: 0,
    build: () => ({
      summary: 'The futur antérieur (“will have done”) marks a future action finished before another one.',
      explanation:
        `The futur antérieur says what WILL HAVE happened by a point in the future. Form it like the passé composé, but put the auxiliary in the futur simple: avoir/être (futur) + past participle.\n\n` +
        `avoir (futur): ${table('avoir', 'F')}.\n\n` +
        `être (futur): ${table('être', 'F')}.\n\n` +
        `It is common after quand, lorsque, dès que and aussitôt que, where English uses a present or present perfect: Quand j'aurai fini, je t'appellerai (When I have finished, I'll call you). French requires the future tense here.\n\n` +
        `Verbs that take être in the passé composé take it here too, and the participle agrees: Elle sera partie avant midi.`,
      examples: [
        { fr: "Quand j'aurai fini, je t'appellerai.", en: 'When I have finished, I will call you.' },
        { fr: 'Elle sera partie avant midi.', en: 'She will have left before noon.' },
        { fr: 'Dès que nous aurons mangé, nous sortirons.', en: 'As soon as we have eaten, we will go out.' },
        { fr: 'Ils auront tout vendu demain.', en: 'They will have sold everything by tomorrow.' },
      ],
      drills: [
        futAntDrill('finir', 0), futAntDrill('manger', 1), futAntDrill('vendre', 3),
        futAntDrill('lire', 4), futAntDrill('faire', 5), futAntDrill('partir', 2, 2, 'être', 'elle'),
        futAntDrill('arriver', 5, 3, 'être', 'elles'),
      ],
    }),
  },
]

// Display order follows the curriculum in lib/grammar.ts, so new rows there
// never leave a seeded lesson with a stale position.
const FR_ORDER = new Map(getCatalog(LANG).map((t, i) => [t.slug, i]))

// Hand-written lessons for the non-conjugation topics (articles, pronouns,
// syntax…). Level/title/topic come from the catalog so the two never drift.
type Written = { slug: string; summary: string; explanation: string; examples: { fr: string; en: string }[]; drills: Drill[] }
const WRITTEN: { lessons: Written[] } = JSON.parse(
  readFileSync(path.join(process.cwd(), 'data', 'french', 'grammar-lessons.json'), 'utf8')
)
for (const w of WRITTEN.lessons) {
  const t = getCatalog(LANG).find((c) => c.slug === w.slug)
  if (!t) throw new Error(`grammar-lessons.json: "${w.slug}" is not in FR_CATALOG`)
  const { slug: _slug, ...body } = w
  LESSONS.push({ slug: t.slug, level: t.level, title: t.title, topic: t.topic, order: 0, build: () => body })
}

const DRY = process.argv.includes('--dry')

// --dry: build every lesson and print it without touching the database.
function dryRun() {
  for (const l of LESSONS) {
    const b = l.build()
    console.log(`
=== ${l.slug} (order ${FR_ORDER.get(l.slug)}) ===
${b.explanation}`)
    for (const e of b.examples) console.log(`  ex: ${e.fr} — ${e.en}`)
    for (const d of b.drills) console.log(`  drill: ${d.prompt}  →  ${d.answer}${d.hint ? `  [${d.hint}]` : ''}`)
  }
  console.log(`
${LESSONS.length} lessons built (dry run, nothing written).`)
}

async function main() {
  if (DRY) return dryRun()
  console.log('Writing to Firestore project', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)

  let count = 0
  let drillTotal = 0
  for (const l of LESSONS) {
    const body = l.build()
    if (body.drills.length === 0) throw new Error(`lesson ${l.slug} produced no drills`)
    await GrammarLesson.findOneAndUpdate(
      { slug: l.slug },
      {
        $set: {
          languageCode: LANG,
          slug: l.slug,
          level: l.level,
          title: l.title,
          topic: l.topic,
          order: FR_ORDER.get(l.slug) ?? l.order,
          summary: body.summary,
          explanation: body.explanation,
          examples: body.examples,
          drills: body.drills,
          isSystem: true,
          generatedAt: new Date(),
        },
      },
      { upsert: true }
    )
    count++
    drillTotal += body.drills.length
    console.log(`  ✓ ${l.slug} — ${body.drills.length} drills, ${body.examples.length} examples`)
  }

  console.log(`\nSeeded ${count} grammar lessons (${drillTotal} drills) (conjugations from LEFFF, the rest hand-written)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
