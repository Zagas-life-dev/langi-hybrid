import { connectDB } from '@/lib/db'
import GrammarLesson, { type IGrammarLesson } from '@/lib/models/GrammarLesson'
import type { CefrLevel } from '@/lib/models/LangiUser'
import { CEFR_LEVELS } from '@/lib/models/LangiUser'

export interface GrammarTopic {
  slug: string
  level: CefrLevel
  title: string
  topic: string
  // A short focus hint that steers the generator toward the right drills.
  focus: string
}

// Curated French grammar curriculum, ordered within each level. Adding a row
// here makes the lesson available. Every French row is seeded from reviewed content
// by scripts/seed-grammar.ts.
const FR_CATALOG: GrammarTopic[] = [
  // A1
  { slug: 'fr-a1-etre', level: 'A1', title: 'The verb être (to be)', topic: 'verbs', focus: 'present-tense conjugation of être with subject pronouns' },
  { slug: 'fr-a1-avoir', level: 'A1', title: 'The verb avoir (to have)', topic: 'verbs', focus: 'present-tense conjugation of avoir and common expressions (avoir faim, avoir ans)' },
  { slug: 'fr-a1-aller-faire', level: 'A1', title: 'The verbs aller & faire', topic: 'verbs', focus: 'present tense of aller (to go) and faire (to do/make) and everyday expressions (faire les courses, il fait beau)' },
  { slug: 'fr-a1-modals', level: 'A1', title: 'pouvoir, vouloir, devoir', topic: 'verbs', focus: 'present tense of the modal verbs + infinitive (je peux venir, je veux manger, je dois partir)' },
  { slug: 'fr-a1-articles', level: 'A1', title: 'Articles: le, la, les, un, une, des', topic: 'nouns', focus: 'choosing definite vs indefinite articles by gender and number' },
  { slug: 'fr-a1-gender-plural', level: 'A1', title: 'Noun gender & plurals', topic: 'nouns', focus: 'masculine/feminine nouns and forming regular plurals' },
  { slug: 'fr-a1-adjectives', level: 'A1', title: 'Adjective agreement & placement', topic: 'adjectives', focus: 'masculine/feminine/plural adjective endings and which short adjectives go before the noun (BAGS: beauty, age, goodness, size)' },
  { slug: 'fr-a1-cest-il-est', level: 'A1', title: "c'est vs il/elle est", topic: 'syntax', focus: "c'est + determiner/noun vs il/elle est + adjective or profession without article" },
  { slug: 'fr-a1-demonstratives', level: 'A1', title: 'Demonstratives: ce, cet, cette, ces', topic: 'adjectives', focus: 'choosing ce/cet/cette/ces by gender, number and a following vowel, plus -ci/-là' },
  { slug: 'fr-a1-er-verbs', level: 'A1', title: 'Regular -er verbs (present)', topic: 'verbs', focus: 'present-tense endings of -er verbs (parler, aimer, habiter)' },
  { slug: 'fr-a1-negation', level: 'A1', title: 'Negation: ne… pas', topic: 'syntax', focus: 'placing ne… pas around the verb' },
  { slug: 'fr-a1-questions', level: 'A1', title: 'Asking questions', topic: 'syntax', focus: 'est-ce que, intonation, and inversion for yes/no questions' },
  { slug: 'fr-a1-possessives', level: 'A1', title: 'Possessive adjectives (mon, ma, mes)', topic: 'adjectives', focus: 'agreement of mon/ma/mes, ton/ta/tes, son/sa/ses with the noun' },
  { slug: 'fr-a1-stressed-pronouns', level: 'A1', title: 'Stressed pronouns (moi, toi, lui…)', topic: 'pronouns', focus: 'moi/toi/lui/elle/nous/vous/eux/elles after prepositions, for emphasis (moi, je…) and in short answers (moi aussi)' },
  { slug: 'fr-a1-prepositions-places', level: 'A1', title: 'Prepositions with places (à, en, au, aux)', topic: 'syntax', focus: 'à + city, en + feminine country, au + masculine country, aux + plural, and à la/au/chez for places and people' },

  // A2
  { slug: 'fr-a2-passe-compose-avoir', level: 'A2', title: 'Passé composé with avoir', topic: 'verbs', focus: 'forming the passé composé with avoir + past participle' },
  { slug: 'fr-a2-passe-compose-etre', level: 'A2', title: 'Passé composé with être', topic: 'verbs', focus: 'être auxiliary verbs (DR MRS VANDERTRAMP) and participle agreement' },
  { slug: 'fr-a2-futur-proche', level: 'A2', title: 'Near future (aller + infinitive)', topic: 'verbs', focus: 'forming the futur proche with aller + infinitive' },
  { slug: 'fr-a2-venir-prendre', level: 'A2', title: 'venir & prendre (+ venir de)', topic: 'verbs', focus: 'present tense of venir and prendre, their families (revenir, devenir, apprendre, comprendre), and the recent past venir de + infinitive' },
  { slug: 'fr-a2-savoir-connaitre', level: 'A2', title: 'savoir vs connaître', topic: 'verbs', focus: 'savoir for facts and skills (+ infinitive or que) vs connaître for people, places and familiarity' },
  { slug: 'fr-a2-everyday-irregulars', level: 'A2', title: 'Everyday irregulars: dire, voir, mettre, lire, écrire, boire', topic: 'verbs', focus: 'present tense and past participles of common irregular verbs' },
  { slug: 'fr-a2-imperative', level: 'A2', title: 'The imperative (commands)', topic: 'verbs', focus: 'tu/nous/vous commands, dropping the -s of -er verbs in the tu form, irregular sois/aie/sache, and negative commands' },
  { slug: 'fr-a2-reflexive', level: 'A2', title: 'Reflexive verbs', topic: 'verbs', focus: 'present-tense reflexive verbs with se/me/te/nous/vous (se laver, se lever)' },
  { slug: 'fr-a2-ir-re-verbs', level: 'A2', title: 'Regular -ir and -re verbs', topic: 'verbs', focus: 'present-tense endings of -ir (finir) and -re (vendre) verbs' },
  { slug: 'fr-a2-comparatives', level: 'A2', title: 'Comparatives & superlatives', topic: 'adjectives', focus: 'plus/moins/aussi… que and le plus / le moins' },
  { slug: 'fr-a2-imparfait', level: 'A2', title: 'The imparfait', topic: 'verbs', focus: 'forming the imparfait and when to use it vs passé composé' },
  { slug: 'fr-a2-pc-vs-imparfait', level: 'A2', title: 'Passé composé vs imparfait', topic: 'verbs', focus: 'choosing between completed events (passé composé) and background, habits and descriptions (imparfait) in the same story' },
  { slug: 'fr-a2-partitive', level: 'A2', title: 'Partitive articles (du, de la, des)', topic: 'nouns', focus: 'using partitives for quantities and de after negation' },
  { slug: 'fr-a2-negation-plus', level: 'A2', title: 'More negation: jamais, rien, plus, personne', topic: 'syntax', focus: 'ne… jamais / rien / plus / personne / que, their placement in simple and compound tenses' },
  { slug: 'fr-a2-time-expressions', level: 'A2', title: 'depuis, il y a, pendant', topic: 'syntax', focus: 'depuis + present for ongoing actions, il y a for “ago”, pendant for a closed duration, and dans for “in (future)”' },
  { slug: 'fr-a2-interrogatives', level: 'A2', title: 'Question words: quel, qui, que, quoi', topic: 'syntax', focus: 'agreement of quel/quelle/quels/quelles, qui vs que vs quoi, and qu’est-ce que vs qui est-ce qui' },
  { slug: 'fr-a2-adverbs', level: 'A2', title: 'Adverbs in -ment & placement', topic: 'adjectives', focus: 'forming adverbs from the feminine adjective (lentement), -amment/-emment, irregulars (bien, mal, vite), and placement in compound tenses' },

  // B1
  { slug: 'fr-b1-futur-simple', level: 'B1', title: 'Futur simple', topic: 'verbs', focus: 'forming the futur simple, including common irregular stems' },
  { slug: 'fr-b1-conditionnel', level: 'B1', title: 'Conditionnel présent', topic: 'verbs', focus: 'forming the conditional and using it for politeness and hypotheses' },
  { slug: 'fr-b1-subjonctif', level: 'B1', title: 'Subjonctif présent (introduction)', topic: 'verbs', focus: 'forming the present subjunctive and common triggers (il faut que, vouloir que)' },
  { slug: 'fr-b1-relative-pronouns', level: 'B1', title: 'Relative pronouns (qui, que, où, dont)', topic: 'syntax', focus: 'choosing qui/que/où/dont to link clauses' },
  { slug: 'fr-b1-object-pronouns', level: 'B1', title: 'Object pronouns (le, la, lui, leur)', topic: 'pronouns', focus: 'direct vs indirect object pronouns and their placement' },
  { slug: 'fr-b1-y-en', level: 'B1', title: 'The pronouns y and en', topic: 'pronouns', focus: 'replacing places/things with y and en' },
  { slug: 'fr-b1-double-pronouns', level: 'B1', title: 'Double object pronouns', topic: 'pronouns', focus: 'order of two pronouns before the verb (me/te/se/nous/vous → le/la/les → lui/leur → y → en) and in affirmative commands' },
  { slug: 'fr-b1-possessive-pronouns', level: 'B1', title: 'Possessive pronouns (le mien, la tienne)', topic: 'pronouns', focus: 'le mien/la mienne/les miens…, agreement with the thing owned, and à moi as an alternative' },
  { slug: 'fr-b1-verb-prepositions', level: 'B1', title: 'Verb + à / de + infinitive', topic: 'syntax', focus: 'which verbs take à (commencer à, aider à), de (essayer de, décider de) or nothing (vouloir, aimer) before an infinitive' },
  { slug: 'fr-b1-plus-que-parfait', level: 'B1', title: 'Plus-que-parfait', topic: 'verbs', focus: 'forming the pluperfect to talk about an earlier past' },
  { slug: 'fr-b1-futur-anterieur', level: 'B1', title: 'Futur antérieur', topic: 'verbs', focus: 'avoir/être in the futur simple + past participle for an action completed before another future one (quand j’aurai fini…)' },

  // B2
  { slug: 'fr-b2-subjonctif-usage', level: 'B2', title: 'Subjonctif: usage & doubt', topic: 'verbs', focus: 'subjunctive after emotion, doubt, and conjunctions (bien que, pour que)' },
  { slug: 'fr-b2-passive', level: 'B2', title: 'The passive voice', topic: 'syntax', focus: 'forming the passive with être + past participle and par' },
  { slug: 'fr-b2-conditionnel-passe', level: 'B2', title: 'Conditionnel passé & si-clauses', topic: 'verbs', focus: 'past conditional and the three si-clause patterns' },
  { slug: 'fr-b2-discours-indirect', level: 'B2', title: 'Reported speech', topic: 'syntax', focus: 'tense shifts when reporting what someone said' },
  { slug: 'fr-b2-faire-causatif', level: 'B2', title: 'faire + infinitive (causative)', topic: 'verbs', focus: 'having something done (je fais réparer ma voiture), pronoun placement, and se faire + infinitive' },
  { slug: 'fr-b2-indefinites', level: 'B2', title: 'Indefinites: tout, chaque, quelque, aucun', topic: 'pronouns', focus: 'tout/toute/tous/toutes, chaque vs chacun, quelques/quelqu’un, aucun(e) and n’importe qui/quoi/où' },

  // C1
  { slug: 'fr-c1-subjonctif-passe', level: 'C1', title: 'Subjonctif passé', topic: 'verbs', focus: 'forming the past subjunctive (aie/sois + participle) and when it replaces the present subjunctive' },
  { slug: 'fr-c1-concordance', level: 'C1', title: 'Sequence of tenses (concordance des temps)', topic: 'verbs', focus: 'matching tenses across main and subordinate clauses, including subjunctive triggers' },
  { slug: 'fr-c1-participe-gerondif', level: 'C1', title: 'Present participle & gérondif', topic: 'verbs', focus: 'distinguishing the participe présent, the gérondif (en + -ant), and adjectival forms' },
  { slug: 'fr-c1-relatifs-composes', level: 'C1', title: 'Compound relative pronouns', topic: 'pronouns', focus: 'lequel/auquel/duquel and relative pronouns after prepositions' },
  { slug: 'fr-c1-mise-en-relief', level: 'C1', title: 'Cleft sentences & emphasis', topic: 'syntax', focus: 'c’est… qui/que, ce qui/ce que… c’est, and fronting for emphasis' },
  { slug: 'fr-c1-connecteurs', level: 'C1', title: 'Advanced logical connectors', topic: 'syntax', focus: 'nuancing argument with en revanche, néanmoins, dans la mesure où, quitte à' },

  // C2
  { slug: 'fr-c2-passe-simple', level: 'C2', title: 'Passé simple & passé antérieur', topic: 'verbs', focus: 'recognising and forming the literary past tenses used in narration' },
  { slug: 'fr-c2-subjonctif-litteraire', level: 'C2', title: 'Literary subjunctive', topic: 'verbs', focus: 'the imperfect and pluperfect subjunctive in formal/literary registers' },
  { slug: 'fr-c2-inversion-stylistique', level: 'C2', title: 'Stylistic inversion & word order', topic: 'syntax', focus: 'subject-verb inversion after adverbs and in subordinate clauses for style' },
  { slug: 'fr-c2-nominalisation', level: 'C2', title: 'Nominalisation & register soutenu', topic: 'syntax', focus: 'turning verbs/clauses into nouns to write in an elevated, concise register' },
]

// Curated Spanish grammar curriculum (mirrors the French scope, Spanish-specific
// topics). The conjugation lessons are seeded verbatim from the Jehle dataset via
// scripts/seed-grammar-es.ts; the rest generate on first open like French.
const ES_CATALOG: GrammarTopic[] = [
  // A1
  { slug: 'es-a1-ser-estar', level: 'A1', title: 'ser vs estar (to be)', topic: 'verbs', focus: 'present-tense ser and estar and when to use each (identity/traits vs states/location)' },
  { slug: 'es-a1-tener', level: 'A1', title: 'The verb tener (to have)', topic: 'verbs', focus: 'present-tense tener and expressions (tener hambre, tener … años)' },
  { slug: 'es-a1-articles', level: 'A1', title: 'Articles: el, la, los, las, un, una', topic: 'nouns', focus: 'choosing definite vs indefinite articles by gender and number' },
  { slug: 'es-a1-gender-plural', level: 'A1', title: 'Noun gender & plurals', topic: 'nouns', focus: 'masculine/feminine nouns and forming regular plurals (-s/-es)' },
  { slug: 'es-a1-ar-verbs', level: 'A1', title: 'Regular -ar verbs (present)', topic: 'verbs', focus: 'present-tense endings of -ar verbs (hablar, trabajar, estudiar)' },
  { slug: 'es-a1-negation', level: 'A1', title: 'Negation with no', topic: 'syntax', focus: 'placing no before the verb and double negatives (no … nada/nunca)' },
  { slug: 'es-a1-questions', level: 'A1', title: 'Asking questions', topic: 'syntax', focus: 'question words (qué, dónde, cómo) and ¿…? yes/no questions' },
  { slug: 'es-a1-possessives', level: 'A1', title: 'Possessive adjectives (mi, tu, su)', topic: 'adjectives', focus: 'agreement of mi(s), tu(s), su(s), nuestro/a(s) with the noun' },

  // A2
  { slug: 'es-a2-er-ir-verbs', level: 'A2', title: 'Regular -er and -ir verbs', topic: 'verbs', focus: 'present-tense endings of -er (comer) and -ir (vivir) verbs' },
  { slug: 'es-a2-preterito', level: 'A2', title: 'Pretérito indefinido', topic: 'verbs', focus: 'forming the preterite for completed past actions, regular and common irregulars' },
  { slug: 'es-a2-imperfecto', level: 'A2', title: 'Pretérito imperfecto', topic: 'verbs', focus: 'forming the imperfect and when to use it vs the preterite' },
  { slug: 'es-a2-perfecto', level: 'A2', title: 'Pretérito perfecto', topic: 'verbs', focus: 'forming the present perfect with haber + past participle' },
  { slug: 'es-a2-ir-a-infinitivo', level: 'A2', title: 'Near future (ir a + infinitive)', topic: 'verbs', focus: 'forming the near future with ir a + infinitive' },
  { slug: 'es-a2-reflexive', level: 'A2', title: 'Reflexive verbs', topic: 'verbs', focus: 'present-tense reflexive verbs with me/te/se/nos/os (llamarse, levantarse)' },
  { slug: 'es-a2-comparatives', level: 'A2', title: 'Comparatives & superlatives', topic: 'adjectives', focus: 'más/menos/tan… que and el más / el menos, plus mejor/peor' },
  { slug: 'es-a2-gustar', level: 'A2', title: 'gustar and similar verbs', topic: 'verbs', focus: 'the gustar construction with indirect object pronouns (me gusta, me gustan)' },

  // B1
  { slug: 'es-b1-futuro', level: 'B1', title: 'Futuro simple', topic: 'verbs', focus: 'forming the simple future, including common irregular stems (tendr-, podr-)' },
  { slug: 'es-b1-condicional', level: 'B1', title: 'Condicional simple', topic: 'verbs', focus: 'forming the conditional and using it for politeness and hypotheses' },
  { slug: 'es-b1-subjuntivo', level: 'B1', title: 'Presente de subjuntivo (introduction)', topic: 'verbs', focus: 'forming the present subjunctive and common triggers (querer que, es importante que)' },
  { slug: 'es-b1-por-para', level: 'B1', title: 'por vs para', topic: 'syntax', focus: 'choosing por (cause/means) vs para (goal/destination/deadline)' },
  { slug: 'es-b1-object-pronouns', level: 'B1', title: 'Object pronouns (lo, la, le, les)', topic: 'pronouns', focus: 'direct vs indirect object pronouns, placement, and se lo' },
  { slug: 'es-b1-pluscuamperfecto', level: 'B1', title: 'Pluscuamperfecto', topic: 'verbs', focus: 'forming the pluperfect (había + participle) for an earlier past' },
  { slug: 'es-b1-imperative', level: 'B1', title: 'The imperative (commands)', topic: 'verbs', focus: 'affirmative and negative tú/usted commands and pronoun attachment' },

  // B2
  { slug: 'es-b2-subjuntivo-usage', level: 'B2', title: 'Subjunctive: emotion, doubt & conjunctions', topic: 'verbs', focus: 'subjunctive after emotion, doubt, and conjunctions (para que, aunque, cuando)' },
  { slug: 'es-b2-passive', level: 'B2', title: 'The passive & se constructions', topic: 'syntax', focus: 'ser + past participle passive and the impersonal/passive se' },
  { slug: 'es-b2-condicional-compuesto', level: 'B2', title: 'Conditional perfect & si-clauses', topic: 'verbs', focus: 'the conditional perfect and the three si-clause patterns' },
  { slug: 'es-b2-estilo-indirecto', level: 'B2', title: 'Reported speech', topic: 'syntax', focus: 'tense shifts when reporting what someone said' },

  // C1
  { slug: 'es-c1-subjuntivo-imperfecto', level: 'C1', title: 'Imperfect subjunctive', topic: 'verbs', focus: 'forming the imperfect subjunctive (-ra/-se) and its uses in si-clauses and courtesy' },
  { slug: 'es-c1-concordancia', level: 'C1', title: 'Sequence of tenses', topic: 'verbs', focus: 'matching indicative/subjunctive tenses across main and subordinate clauses' },
  { slug: 'es-c1-perifrasis', level: 'C1', title: 'Verbal periphrases', topic: 'verbs', focus: 'llevar/seguir + gerund, acabar de, ponerse a, volver a + infinitive' },
  { slug: 'es-c1-relativos', level: 'C1', title: 'Relative pronouns (que, quien, cuyo, el cual)', topic: 'pronouns', focus: 'choosing relative pronouns, especially after prepositions, and cuyo' },
  { slug: 'es-c1-ser-estar-avanzado', level: 'C1', title: 'Advanced ser/estar & adjective shifts', topic: 'verbs', focus: 'meaning changes with ser vs estar (es listo/está listo) and passive nuance' },
  { slug: 'es-c1-connectors', level: 'C1', title: 'Advanced logical connectors', topic: 'syntax', focus: 'nuancing argument with no obstante, por ende, en cuanto a, a no ser que' },

  // C2
  { slug: 'es-c2-subjuntivo-literario', level: 'C2', title: 'Advanced subjunctive & literary nuance', topic: 'verbs', focus: 'pluperfect subjunctive, -ra as literary past, and fixed subjunctive expressions' },
  { slug: 'es-c2-registro-dialecto', level: 'C2', title: 'Register & dialectal variation', topic: 'syntax', focus: 'voseo, vosotros vs ustedes, and shifting between formal and colloquial register' },
  { slug: 'es-c2-orden-palabras', level: 'C2', title: 'Stylistic word order & emphasis', topic: 'syntax', focus: 'fronting, subject-verb inversion and cleft sentences (fue … quien) for emphasis' },
  { slug: 'es-c2-nominalizacion', level: 'C2', title: 'Nominalisation & formal register', topic: 'syntax', focus: 'turning verbs/clauses into nouns to write in an elevated, concise register' },
]

// All curated curricula, keyed by language. The grammar page renders the catalog
// for the learner's language; uncurated languages fall back to an empty list (the
// AI tutor + on-demand lessons still cover them).
// AI-drafted Yoruba, Igbo and Hausa A1 curricula (content in data/grammar-ng/<lang>.json, seeded by
// scripts/seed-grammar-ng.ts). Slugs here must match the JSON.
function ngCatalog(lang: 'yo' | 'ig' | 'ha', rows: [string, string, string, string][]): GrammarTopic[] {
  return rows.map(([key, title, topic, focus]) => ({ slug: `${lang}-a1-${key}`, level: 'A1' as CefrLevel, title, topic, focus }))
}
const YO_CATALOG = ngCatalog('yo', [["pronouns","Pronouns: mo, o, ó, a, ẹ, wọ́n","pronouns","the short subject pronouns before the verb"],["aspect","Tense words: ń, ti, máa","verbs","ń for in progress, ti for done, máa and yóò for the future"],["negation","Saying no: mi ò, kò","syntax","the negative words that replace the pronoun before the verb"],["be","Being: jẹ́, wà, ni","verbs","jẹ́ for identity, wà for place, ni for pointing out"],["questions","Asking questions","syntax","ṣé and the question words kí, ta, ibo, mélòó"],["nouns","Nouns: àwọn, kan, náà","nouns","no plural form; àwọn, numbers, kan (a) and náà (the)"],["possession","Possession: mi, rẹ, wa","pronouns","owner after the noun and the possessive words"],["adjectives","Adjectives after the noun","adjectives","adjective follows the noun; náà goes last"]])
const IG_CATALOG = ngCatalog('ig', [["pronouns","Pronouns: m, ị, ọ, anyị, unu, ha","pronouns","subject pronouns and the Ana m pattern"],["tenses","Time: na-, aga, past endings","verbs","na- progressive, aga future and -ra/-rọ past"],["be","Being: bụ and nọ","verbs","bụ for identity, nọ for place; describing words as verbs"],["negation","Saying no: -ghị","syntax","the -ghị negative ending in present, past and future"],["questions","Asking questions","syntax","gịnị, onye, ebee, kedu, ole"],["possession","Possession: m, gị, ya","pronouns","owner after the noun"],["plurals","Plurals: ndị, ụmụ, numbers","nouns","ndị and ụmụ before the noun, numbers after it"],["politeness","Greetings, please and commands","syntax","Ndewo, Biko, Daalụ and the command form"]])
const HA_CATALOG = ngCatalog('ha', [["completive","Past: na, ya, ta, mun, sun","verbs","completive pronoun forms before the verb"],["continuous","Now: ina, yana, tana, suna","verbs","continuous forms plus a verbal noun"],["future","Future: zan, zai, za mu","verbs","future pronoun forms"],["gender","Gender: masculine and feminine","nouns","noun gender and ya/ta agreement"],["be","Being: ne and ce","syntax","ne for masculine and plural, ce for feminine"],["negation","Saying no: ba … ba","syntax","ban, bai, bata, ba na with ba at the end"],["plurals","Irregular plurals","nouns","learn each plural pair"],["possession","Possession: gidana, motata","pronouns","gendered possessive endings"]])

export const GRAMMAR_CATALOGS: Record<string, GrammarTopic[]> = {
  fr: FR_CATALOG,
  es: ES_CATALOG,
  yo: YO_CATALOG,
  ig: IG_CATALOG,
  ha: HA_CATALOG,
}

/** The grammar curriculum for a language (empty if none is curated yet). */
export function getCatalog(lang?: string | null): GrammarTopic[] {
  return (lang && GRAMMAR_CATALOGS[lang]) || []
}

// Slug → topic across every catalog (slugs are language-prefixed, so unique).
const BY_SLUG = new Map(Object.values(GRAMMAR_CATALOGS).flat().map((t) => [t.slug, t]))
export function grammarTopic(slug: string): GrammarTopic | undefined {
  return BY_SLUG.get(slug)
}

// Which lessons a learner can open: everything at or below their level, plus the
// next level up (so there's always something to stretch toward). No placement
// test yet → treat as A1.
export function unlockedLevels(cefr?: CefrLevel | null): Set<CefrLevel> {
  const idx = cefr ? CEFR_LEVELS.indexOf(cefr) : 0
  const maxIdx = Math.min(CEFR_LEVELS.length - 1, Math.max(0, idx) + 1)
  return new Set(CEFR_LEVELS.slice(0, maxIdx + 1))
}

/**
 * Load a grammar lesson. Every lesson is seeded from data/<language>/grammar-lessons.json, so this is
 * a plain read: null when the slug has no lesson.
 */
export async function ensureLesson(slug: string): Promise<IGrammarLesson | null> {
  await connectDB()
  return GrammarLesson.findOne({ slug }).lean<IGrammarLesson | null>()
}
