/**
 * Seed structured Spanish grammar lessons from a REAL conjugation dataset.
 * Run from the langi/ root:
 *     npm run seed-grammar-es
 *
 * Conjugation forms come verbatim from data/spanish/jehle-conjugations.json — a
 * subset of the public-domain Fred Jehle Spanish Verbs database; see the NOTICE
 * beside it. The drills and explanation tables are therefore accurate by
 * construction rather than AI-generated. Non-conjugation topics (articles,
 * por/para, pronouns, syntax) are still generated on demand by lib/grammar.ts.
 *
 * Idempotent: each lesson is upserted by slug, overwriting body + drills. Lesson
 * order follows the Spanish catalog in lib/grammar.ts.
 */
import * as dotenv from 'dotenv'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import GrammarLesson from '../lib/models/GrammarLesson'
import type { CefrLevel } from '../lib/models/LangiUser'

dotenv.config({ path: '.env.local' })

const LANG = 'es'

// verb -> { tenseKey: [yo, tú, él, nosotros, vosotros, ellos], ger, part }
type Conj = { ger: string; part: string; english?: string } & Record<string, string[] | string | undefined>
const DATA: Record<string, Conj> = JSON.parse(
  readFileSync(path.join(process.cwd(), 'data', 'spanish', 'jehle-conjugations.json'), 'utf8')
)

const SUBJ = ['yo', 'tú', 'él', 'nosotros', 'vosotros', 'ellos']
const SUBJ_CAP = ['Yo', 'Tú', 'Él', 'Nosotros', 'Vosotros', 'Ellos']

function conj(verb: string, tense: string, i: number): string {
  const e = DATA[verb]
  if (!e || !Array.isArray(e[tense])) throw new Error(`missing ${tense} for "${verb}"`)
  const f = (e[tense] as string[])[i]
  if (!f) throw new Error(`no ${tense}[${i}] for "${verb}"`)
  return f
}
const part = (verb: string) => {
  const p = DATA[verb]?.part
  if (!p) throw new Error(`no participle for "${verb}"`)
  return p
}
// Full paradigm as a readable inline table for explanations.
function table(verb: string, tense: string): string {
  return SUBJ.map((s, i) => `${s} ${conj(verb, tense, i)}`).join(' · ')
}

// --- Drill builders --------------------------------------------------------
type Drill = { prompt: string; answer: string; hint?: string }

function tenseDrill(verb: string, tense: string, i: number, tenseName?: string): Drill {
  const cue = tenseName ? `${verb}, ${tenseName}` : verb
  return { prompt: `${SUBJ_CAP[i]} ___. (${cue})`, answer: conj(verb, tense, i) }
}
const presentDrill = (verb: string, i: number, hint?: string): Drill => ({ ...tenseDrill(verb, 'pres', i), hint })
// Pretérito perfecto: haber (presente) + participio.
function perfDrill(verb: string, i: number): Drill {
  return { prompt: `${SUBJ_CAP[i]} ${conj('haber', 'pres', i)} ___. (${verb})`, answer: part(verb), hint: 'participio' }
}
// Pluscuamperfecto: haber (imperfecto) + participio.
function pqpDrill(verb: string, i: number): Drill {
  return { prompt: `${SUBJ_CAP[i]} ${conj('haber', 'imp', i)} ___. (${verb})`, answer: part(verb), hint: 'participio' }
}
// Futuro próximo: ir (presente) + a + infinitivo.
function iraDrill(i: number, inf: string): Drill {
  return { prompt: `${SUBJ_CAP[i]} ___ a ${inf}. (ir)`, answer: conj('ir', 'pres', i) }
}
const REFL = ['me', 'te', 'se', 'nos', 'os', 'se']
function reflexiveDrill(base: string, i: number): Drill {
  return { prompt: `${SUBJ_CAP[i]} ___. (${base}se)`, answer: `${REFL[i]} ${conj(base, 'pres', i)}` }
}
// gustar-type: indirect pronoun + gusta/gustan agreeing with the THING.
const IO = ['Me', 'Te', 'Le', 'Nos', 'Os', 'Les']
function gustarDrill(ioIndex: number, thing: string, plural: boolean): Drill {
  return { prompt: `${IO[ioIndex]} ___ ${thing}. (gustar)`, answer: conj('gustar', 'pres', plural ? 5 : 2), hint: plural ? 'plural' : 'singular' }
}

// --- Lessons ---------------------------------------------------------------
interface SeedLesson {
  slug: string
  level: CefrLevel
  title: string
  topic: string
  build: () => { summary: string; explanation: string; examples: { fr: string; en: string }[]; drills: Drill[] }
}

const LESSONS: SeedLesson[] = [
  {
    slug: 'es-a1-ser-estar', level: 'A1', title: 'ser vs estar (to be)', topic: 'verbs',
    build: () => ({
      summary: 'Spanish has two verbs for “to be”: ser for identity and traits, estar for states and location.',
      explanation:
        `Spanish splits English “to be” into two irregular verbs. Learn both present tenses by heart:\n\n` +
        `ser: ${table('ser', 'pres')}.\n\n` +
        `estar: ${table('estar', 'pres')}.\n\n` +
        `Use ser for permanent identity, origin, profession and characteristics (Soy estudiante; Ella es alta). ` +
        `Use estar for location and temporary states (Estoy en casa; Estoy cansado).`,
      examples: [
        { fr: 'Yo soy de España.', en: 'I am from Spain.' },
        { fr: 'Ella es profesora.', en: 'She is a teacher.' },
        { fr: 'Estamos en el parque.', en: 'We are in the park.' },
        { fr: 'Estoy muy cansado hoy.', en: 'I am very tired today.' },
      ],
      drills: [
        presentDrill('ser', 0), presentDrill('ser', 2), presentDrill('ser', 3),
        presentDrill('estar', 0), presentDrill('estar', 2), presentDrill('estar', 4),
      ],
    }),
  },
  {
    slug: 'es-a1-tener', level: 'A1', title: 'The verb tener (to have)', topic: 'verbs',
    build: () => ({
      summary: 'tener means “to have” and appears in many fixed expressions of state.',
      explanation:
        `tener (“to have”) is irregular and very common. Present tense:\n\n` +
        `${table('tener', 'pres')}.\n\n` +
        `Besides possession (Tengo un coche), tener forms expressions of state where English uses “to be”: ` +
        `tener hambre (to be hungry), tener sed, tener frío/calor, tener … años (to be … years old): Tengo veinte años.`,
      examples: [
        { fr: 'Tengo dos hermanos.', en: 'I have two brothers.' },
        { fr: 'Ella tiene hambre.', en: 'She is hungry.' },
        { fr: '¿Cuántos años tienes?', en: 'How old are you?' },
      ],
      drills: [
        presentDrill('tener', 0), presentDrill('tener', 1), presentDrill('tener', 2),
        presentDrill('tener', 3), presentDrill('tener', 4), presentDrill('tener', 5),
      ],
    }),
  },
  {
    slug: 'es-a1-ar-verbs', level: 'A1', title: 'Regular -ar verbs (present)', topic: 'verbs',
    build: () => ({
      summary: 'Most Spanish verbs end in -ar and share one set of present-tense endings.',
      explanation:
        `Verbs ending in -ar (the largest group) are regular. Drop -ar and add: -o, -as, -a, -amos, -áis, -an.\n\n` +
        `hablar (to speak): ${table('hablar', 'pres')}.\n\n` +
        `The same endings work for trabajar, estudiar, comprar and thousands more.`,
      examples: [
        { fr: 'Yo hablo español.', en: 'I speak Spanish.' },
        { fr: 'Nosotros trabajamos aquí.', en: 'We work here.' },
        { fr: 'Ellos estudian inglés.', en: 'They study English.' },
      ],
      drills: [
        presentDrill('hablar', 0), presentDrill('hablar', 1), presentDrill('trabajar', 3),
        presentDrill('estudiar', 5), presentDrill('comprar', 2), presentDrill('viajar', 4),
      ],
    }),
  },
  {
    slug: 'es-a2-er-ir-verbs', level: 'A2', title: 'Regular -er and -ir verbs', topic: 'verbs',
    build: () => ({
      summary: 'Regular -er and -ir verbs share almost the same present-tense endings.',
      explanation:
        `Regular -er verbs add -o, -es, -e, -emos, -éis, -en:\n\n` +
        `comer (to eat): ${table('comer', 'pres')}.\n\n` +
        `Regular -ir verbs are identical except in the nosotros/vosotros forms (-imos, -ís):\n\n` +
        `vivir (to live): ${table('vivir', 'pres')}.`,
      examples: [
        { fr: 'Yo como a la una.', en: 'I eat at one o’clock.' },
        { fr: 'Nosotros vivimos en Madrid.', en: 'We live in Madrid.' },
        { fr: 'Ella escribe una carta.', en: 'She writes a letter.' },
      ],
      drills: [
        presentDrill('comer', 1), presentDrill('comer', 3), presentDrill('beber', 2),
        presentDrill('vivir', 0), presentDrill('escribir', 3), presentDrill('aprender', 5),
      ],
    }),
  },
  {
    slug: 'es-a2-preterito', level: 'A2', title: 'Pretérito indefinido', topic: 'verbs',
    build: () => ({
      summary: 'The preterite tells what happened — single, completed past actions.',
      explanation:
        `The pretérito indefinido reports completed past events. Regular endings:\n` +
        `-ar → -é, -aste, -ó, -amos, -asteis, -aron · -er/-ir → -í, -iste, -ió, -imos, -isteis, -ieron.\n\n` +
        `hablar: ${table('hablar', 'pret')}.\n\n` +
        `comer: ${table('comer', 'pret')}.\n\n` +
        `Key irregulars must be memorised, e.g. ser/ir share forms: ${table('ir', 'pret')}.`,
      examples: [
        { fr: 'Ayer hablé con María.', en: 'Yesterday I spoke with María.' },
        { fr: 'Comimos en un restaurante.', en: 'We ate at a restaurant.' },
        { fr: 'Ella fue al cine.', en: 'She went to the cinema.' },
      ],
      drills: [
        tenseDrill('hablar', 'pret', 0, 'pretérito'), tenseDrill('comer', 'pret', 2, 'pretérito'),
        tenseDrill('vivir', 'pret', 3, 'pretérito'), tenseDrill('tener', 'pret', 0, 'pretérito'),
        tenseDrill('hacer', 'pret', 2, 'pretérito'), tenseDrill('ir', 'pret', 5, 'pretérito'),
      ],
    }),
  },
  {
    slug: 'es-a2-imperfecto', level: 'A2', title: 'Pretérito imperfecto', topic: 'verbs',
    build: () => ({
      summary: 'The imperfect describes past habits, descriptions and ongoing background.',
      explanation:
        `The imperfect is the “background” past tense: habits, repeated actions and descriptions. ` +
        `Endings: -ar → -aba… · -er/-ir → -ía….\n\n` +
        `hablar: ${table('hablar', 'imp')}.\n\n` +
        `comer: ${table('comer', 'imp')}.\n\n` +
        `Only three verbs are irregular: ser (${table('ser', 'imp')}), ir and ver. Compare with the preterite, ` +
        `which is for single, completed events.`,
      examples: [
        { fr: 'Cuando era niño, jugaba mucho.', en: 'When I was a child, I played a lot.' },
        { fr: 'Siempre comíamos juntos.', en: 'We always used to eat together.' },
        { fr: 'Llovía y hacía frío.', en: 'It was raining and it was cold.' },
      ],
      drills: [
        tenseDrill('hablar', 'imp', 0, 'imperfecto'), tenseDrill('comer', 'imp', 3, 'imperfecto'),
        tenseDrill('vivir', 'imp', 1, 'imperfecto'), tenseDrill('ser', 'imp', 2, 'imperfecto'),
        tenseDrill('tener', 'imp', 4, 'imperfecto'), tenseDrill('estar', 'imp', 5, 'imperfecto'),
      ],
    }),
  },
  {
    slug: 'es-a2-perfecto', level: 'A2', title: 'Pretérito perfecto', topic: 'verbs',
    build: () => ({
      summary: 'The present perfect = haber (present) + past participle, for recent/relevant past.',
      explanation:
        `The pretérito perfecto links the past to now (“have done”). Form it with haber in the present + the past participle.\n\n` +
        `haber: ${table('haber', 'pres')}.\n\n` +
        `Participles: -ar → -ado (hablar → hablado), -er/-ir → -ido (comer → comido, vivir → vivido). ` +
        `Common irregulars: hacer → hecho, ver → visto, escribir → escrito, decir → dicho. The participle never changes here.`,
      examples: [
        { fr: 'He comido demasiado.', en: 'I have eaten too much.' },
        { fr: 'Hemos visto esa película.', en: 'We have seen that film.' },
        { fr: '¿Has hecho la tarea?', en: 'Have you done the homework?' },
      ],
      drills: [
        perfDrill('hablar', 0), perfDrill('comer', 1), perfDrill('vivir', 3),
        perfDrill('hacer', 2), perfDrill('ver', 4), perfDrill('escribir', 5),
      ],
    }),
  },
  {
    slug: 'es-a2-ir-a-infinitivo', level: 'A2', title: 'Near future (ir a + infinitive)', topic: 'verbs',
    build: () => ({
      summary: 'The near future = ir (present) + a + an infinitive: “going to do”.',
      explanation:
        `To talk about the near future, use ir in the present + a + an infinitive — like English “going to”.\n\n` +
        `ir: ${table('ir', 'pres')}.\n\n` +
        `Voy a comer = I am going to eat. Vamos a viajar = We are going to travel. Only ir changes; the second verb stays in the infinitive.`,
      examples: [
        { fr: 'Voy a estudiar esta noche.', en: 'I am going to study tonight.' },
        { fr: 'Vamos a comer pronto.', en: 'We are going to eat soon.' },
        { fr: 'Ellos van a viajar a México.', en: 'They are going to travel to Mexico.' },
      ],
      drills: [
        iraDrill(0, 'comer'), iraDrill(1, 'salir'), iraDrill(2, 'trabajar'),
        iraDrill(3, 'viajar'), iraDrill(4, 'estudiar'), iraDrill(5, 'llegar'),
      ],
    }),
  },
  {
    slug: 'es-a2-reflexive', level: 'A2', title: 'Reflexive verbs', topic: 'verbs',
    build: () => ({
      summary: 'Reflexive verbs carry a pronoun (me, te, se…) that matches the subject.',
      explanation:
        `Reflexive (pronominal) verbs describe actions done to oneself. They take a pronoun before the conjugated verb: ` +
        `me, te, se, nos, os, se.\n\n` +
        `llamarse (to be called): ${SUBJ.map((s, i) => `${s} ${REFL[i]} ${conj('llamar', 'pres', i)}`).join(' · ')}.\n\n` +
        `Many daily-routine verbs are reflexive: levantarse (to get up), ducharse, acostarse, despertarse.`,
      examples: [
        { fr: 'Me llamo Ana.', en: 'My name is Ana.' },
        { fr: 'Te levantas temprano.', en: 'You get up early.' },
        { fr: 'Nos acostamos tarde.', en: 'We go to bed late.' },
      ],
      drills: [
        reflexiveDrill('llamar', 0), reflexiveDrill('levantar', 1), reflexiveDrill('duchar', 2),
        reflexiveDrill('despertar', 3), reflexiveDrill('lavar', 4), reflexiveDrill('acostar', 5),
      ],
    }),
  },
  {
    slug: 'es-a2-gustar', level: 'A2', title: 'gustar and similar verbs', topic: 'verbs',
    build: () => ({
      summary: 'gustar works “backwards”: the thing liked is the subject, and the person is an indirect pronoun.',
      explanation:
        `gustar does not mean “to like” literally — it means “to be pleasing”. The thing liked is the grammatical ` +
        `subject, so the verb agrees with IT, not with the person.\n\n` +
        `Use an indirect pronoun + gusta (singular thing) or gustan (plural things): me, te, le, nos, os, les.\n\n` +
        `Me gusta el café (singular) · Me gustan los libros (plural). Verbs like encantar, interesar and doler work the same way.`,
      examples: [
        { fr: 'Me gusta la música.', en: 'I like music.' },
        { fr: 'Te gustan los animales.', en: 'You like animals.' },
        { fr: 'Nos encanta viajar.', en: 'We love to travel.' },
      ],
      drills: [
        gustarDrill(0, 'el chocolate', false), gustarDrill(1, 'los deportes', true),
        gustarDrill(2, 'la película', false), gustarDrill(3, 'las flores', true),
        gustarDrill(4, 'el museo', false), gustarDrill(5, 'los idiomas', true),
      ],
    }),
  },
  {
    slug: 'es-b1-futuro', level: 'B1', title: 'Futuro simple', topic: 'verbs',
    build: () => ({
      summary: 'The simple future expresses what will happen, with one set of endings on the infinitive.',
      explanation:
        `The futuro simple says what WILL happen. Add the SAME endings to the full infinitive for all verb groups: ` +
        `-é, -ás, -á, -emos, -éis, -án.\n\n` +
        `hablar: ${table('hablar', 'fut')}.\n\n` +
        `Some common verbs have irregular stems but the same endings: tener → tendr- (${table('tener', 'fut')}), ` +
        `hacer → har-, poder → podr-, decir → dir-.`,
      examples: [
        { fr: 'Mañana hablaré con el jefe.', en: 'Tomorrow I will speak with the boss.' },
        { fr: 'Tendremos tiempo el sábado.', en: 'We will have time on Saturday.' },
        { fr: '¿Qué harás este verano?', en: 'What will you do this summer?' },
      ],
      drills: [
        tenseDrill('hablar', 'fut', 0, 'futuro'), tenseDrill('comer', 'fut', 1, 'futuro'),
        tenseDrill('vivir', 'fut', 3, 'futuro'), tenseDrill('tener', 'fut', 2, 'futuro'),
        tenseDrill('hacer', 'fut', 4, 'futuro'), tenseDrill('poder', 'fut', 5, 'futuro'),
      ],
    }),
  },
  {
    slug: 'es-b1-condicional', level: 'B1', title: 'Condicional simple', topic: 'verbs',
    build: () => ({
      summary: 'The conditional expresses “would”, for politeness and hypotheses.',
      explanation:
        `The condicional means “would”. Use the SAME stem as the future (infinitive or irregular stem) + the imperfect ` +
        `-er/-ir endings: -ía, -ías, -ía, -íamos, -íais, -ían.\n\n` +
        `hablar: ${table('hablar', 'cond')}.\n\n` +
        `It softens requests (Me gustaría… = I would like…) and states hypotheticals (Yo viviría en el campo). ` +
        `Irregular stems match the future: tener → tendría, hacer → haría.`,
      examples: [
        { fr: 'Me gustaría un café.', en: 'I would like a coffee.' },
        { fr: 'Yo viajaría más.', en: 'I would travel more.' },
        { fr: '¿Podrías ayudarme?', en: 'Could you help me?' },
      ],
      drills: [
        tenseDrill('hablar', 'cond', 0, 'condicional'), tenseDrill('comer', 'cond', 1, 'condicional'),
        tenseDrill('vivir', 'cond', 3, 'condicional'), tenseDrill('tener', 'cond', 2, 'condicional'),
        tenseDrill('hacer', 'cond', 4, 'condicional'), tenseDrill('poder', 'cond', 5, 'condicional'),
      ],
    }),
  },
  {
    slug: 'es-b1-subjuntivo', level: 'B1', title: 'Presente de subjuntivo (introduction)', topic: 'verbs',
    build: () => ({
      summary: 'The subjunctive appears after expressions of wish, emotion and necessity.',
      explanation:
        `The subjunctive is a mood used after triggers like querer que, es importante que, ojalá and para que, to express ` +
        `wishes, emotion or necessity. Take the yo form of the present, drop -o, and switch endings: -ar verbs take -e…, ` +
        `-er/-ir verbs take -a….\n\n` +
        `hablar: ${table('hablar', 'sub')}.\n\n` +
        `comer: ${table('comer', 'sub')}.\n\n` +
        `Irregulars: ser → sea, ir → vaya, tener → tenga. Trigger example: Quiero que hables más despacio.`,
      examples: [
        { fr: 'Quiero que hables conmigo.', en: 'I want you to talk to me.' },
        { fr: 'Es importante que comas bien.', en: 'It is important that you eat well.' },
        { fr: 'Ojalá tengamos suerte.', en: 'Hopefully we will have luck.' },
      ],
      drills: [
        tenseDrill('hablar', 'sub', 1, 'subjuntivo'), tenseDrill('comer', 'sub', 1, 'subjuntivo'),
        tenseDrill('vivir', 'sub', 2, 'subjuntivo'), tenseDrill('ser', 'sub', 0, 'subjuntivo'),
        tenseDrill('tener', 'sub', 3, 'subjuntivo'), tenseDrill('ir', 'sub', 5, 'subjuntivo'),
      ],
    }),
  },
  {
    slug: 'es-b1-pluscuamperfecto', level: 'B1', title: 'Pluscuamperfecto', topic: 'verbs',
    build: () => ({
      summary: 'The pluperfect (“had done”) describes an action before another past action.',
      explanation:
        `The pluscuamperfecto expresses an action that happened BEFORE another past action — English “had done”. ` +
        `Form it with haber in the imperfect + the past participle.\n\n` +
        `haber (imperfecto): ${table('haber', 'imp')}.\n\n` +
        `Había comido antes de salir = I had eaten before leaving. The participle is the same as in the perfect ` +
        `(hablado, comido, vivido; hecho, visto, dicho).`,
      examples: [
        { fr: 'Ya había comido cuando llegaste.', en: 'I had already eaten when you arrived.' },
        { fr: 'Nunca habíamos visto eso.', en: 'We had never seen that.' },
        { fr: 'Ella había estudiado francés antes.', en: 'She had studied French before.' },
      ],
      drills: [
        pqpDrill('hablar', 0), pqpDrill('comer', 1), pqpDrill('vivir', 2),
        pqpDrill('hacer', 3), pqpDrill('ver', 4), pqpDrill('escribir', 5),
      ],
    }),
  },
]

async function main() {
  console.log('Writing to Firestore project', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)

  // The grammar index page orders lessons by the catalog in lib/grammar.ts, so
  // the stored `order` here is only a stable secondary sort — lesson sequence.
  let count = 0
  let drillTotal = 0
  for (const [idx, l] of LESSONS.entries()) {
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
          order: idx,
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

  console.log(`\nSeeded ${count} Spanish grammar lessons (${drillTotal} drills) from the Jehle dataset.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
