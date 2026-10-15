// ---------------------------------------------------------------------------
// Genre / trope / premise scaffold for AI stories. This is the "tool" the story
// generator reaches into so plots are DEEP and interesting instead of flat:
// each genre carries its conventions, a few tropes, settings and original premise
// seeds. We author original premises (genre conventions aren't copyrightable;
// specific published plots are) so nothing is lifted from existing works.
//
// Pure data + helpers — safe to import on both the client (the genre picker) and
// the server (the generator).
// ---------------------------------------------------------------------------

export interface Genre {
  key: string
  label: string
  emoji: string
  /** One line describing the genre's feel — injected into the prompt. */
  feel: string
  /** Recurring devices the AI can weave in for texture. */
  tropes: string[]
  /** Places the story can be set. */
  settings: string[]
  /** Short, original story hooks to spark a real plot. */
  premises: string[]
}

export const GENRES: Genre[] = [
  {
    key: 'kdrama',
    label: 'K-drama',
    emoji: '🌸',
    feel: 'emotional, slow-burn romance and melodrama with warmth, longing and a bittersweet turn',
    tropes: ['second chances', 'a misunderstanding kept too long', 'opposites drawn together', 'a quiet sacrifice', 'fate and coincidence'],
    settings: ['a small neighbourhood café', 'a university campus', 'a hospital night shift', 'a family-run restaurant', 'a seaside town in winter'],
    premises: [
      'two strangers keep meeting by accident and slowly realise it is not chance',
      'an old promise resurfaces years later and forces a choice',
      'a busy doctor and a clumsy newcomer clash, then can\'t stay apart',
      'someone returns home to care for a parent and meets a face from their past',
    ],
  },
  {
    key: 'highschool',
    label: 'High-school drama',
    emoji: '🎒',
    feel: 'coming-of-age friendship, rivalry and self-discovery with real stakes for a teenager',
    tropes: ['the new student', 'a falling-out between best friends', 'a secret talent', 'standing up to a clique', 'an exam that changes everything'],
    settings: ['a high school', 'a school theatre', 'a science fair', 'the school rooftop', 'a class trip'],
    premises: [
      'a shy student is paired with the most popular one for a project',
      'two best friends compete for the same spot on the team',
      'a new student hides a talent that could change the group',
      'an embarrassing rumour spreads and someone decides to face it',
    ],
  },
  {
    key: 'coming-of-age',
    label: 'Coming-of-age',
    emoji: '🌱',
    feel: 'a sensitive story of growth, belonging and quiet courage with a constructive, hopeful arc',
    tropes: ['standing up to a bully with kindness', 'finding an unlikely mentor', 'a small act of bravery', 'learning to forgive', 'finding your voice'],
    settings: ['a new town', 'a summer job', 'a grandparent\'s house', 'a community centre', 'a long bus route'],
    premises: [
      'a teenager mocked at school finds confidence through an unexpected friendship',
      'a quiet kid stands up, gently, for someone being picked on',
      'a summer with a gruff grandparent slowly changes how someone sees the world',
      'a misfit discovers a club where they finally belong',
    ],
  },
  {
    key: 'romance',
    label: 'Romance',
    emoji: '❤️',
    feel: 'tender, character-driven love story with yearning and a satisfying emotional payoff',
    tropes: ['friends to lovers', 'a letter never sent', 'one last chance at the station', 'mistaken first impressions', 'falling for the wrong-seeming person'],
    settings: ['a bookshop', 'a wedding', 'a train across the country', 'a rainy city', 'a vineyard'],
    premises: [
      'two people swap umbrellas in the rain and keep finding reasons to meet',
      'a florist and a regular customer never quite say what they mean',
      'old pen-pals meet in person for the first time',
      'a planner falls for the one person who refuses to follow the plan',
    ],
  },
  {
    key: 'romcom',
    label: 'Rom-com',
    emoji: '😂',
    feel: 'light, witty and warm with comic misunderstandings and a feel-good ending',
    tropes: ['fake dating', 'a chaotic meet-cute', 'rival businesses next door', 'a disastrous first date that works out', 'a meddling best friend'],
    settings: ['two rival coffee shops', 'a cooking class', 'a dog park', 'an office', 'a disastrous group holiday'],
    premises: [
      'two rivals must pretend to be a couple to win a contest',
      'a series of texting mix-ups leads to the perfect wrong number',
      'neighbours wage a friendly war over a shared balcony',
      'a cooking class disaster brings two clumsy strangers together',
    ],
  },
  {
    key: 'mystery',
    label: 'Mystery',
    emoji: '🕵️',
    feel: 'an intriguing puzzle with clues, red herrings and a clever reveal',
    tropes: ['a locked room', 'an unreliable witness', 'a clue hidden in plain sight', 'the least likely culprit', 'a ticking clock'],
    settings: ['a quiet village', 'an old hotel', 'a train', 'a museum after closing', 'a snowed-in cabin'],
    premises: [
      'a small object goes missing and the whole town has a motive',
      'a guest disappears from a hotel where every door was locked',
      'a detective gets an anonymous note predicting the next clue',
      'a museum piece is swapped for a fake — but when?',
    ],
  },
  {
    key: 'action',
    label: 'Action',
    emoji: '💥',
    feel: 'fast-paced, high-stakes adventure with tension and a race against time (non-graphic)',
    tropes: ['a countdown', 'an unlikely hero', 'a daring escape', 'a double-cross', 'one last mission'],
    settings: ['a city at night', 'a mountain pass', 'a harbour', 'a speeding train', 'a remote research station'],
    premises: [
      'an ordinary commuter must stop a runaway train',
      'a courier realises the package they carry is being hunted',
      'a guide leads strangers down a mountain as a storm closes in',
      'a retired hero is pulled back for one impossible favour',
    ],
  },
  {
    key: 'heist',
    label: 'Heist',
    emoji: '💎',
    feel: 'a clever caper with a crew, a plan, a twist and a satisfying turn',
    tropes: ['the one last job', 'a plan within a plan', 'the inside person', 'the thing that goes wrong', 'the double bluff'],
    settings: ['a grand museum', 'a casino', 'an auction house', 'a vault under a bank', 'a luxury train'],
    premises: [
      'a crew plans to return a stolen painting without anyone noticing',
      'a magician\'s assistant plots the perfect, harmless trick on a thief',
      'a team must swap a fake for the real gem during one song at a gala',
      'the newest crew member may not be who they claim',
    ],
  },
  {
    key: 'scifi',
    label: 'Sci-fi',
    emoji: '🚀',
    feel: 'imaginative speculation with a human heart and a thought-provoking idea',
    tropes: ['a message from the future', 'a memory that isn\'t yours', 'first contact', 'a glitch in the routine', 'a choice with no undo'],
    settings: ['a space station', 'a near-future city', 'a colony ship', 'a lab', 'a town where time runs oddly'],
    premises: [
      'a worker on a quiet station receives a message in their own voice',
      'a city wakes to find yesterday repeating, and only one person notices',
      'a child befriends a visitor no one else can see',
      'a memory shop offers to sell back a day you\'d forgotten',
    ],
  },
  {
    key: 'fantasy',
    label: 'Fantasy',
    emoji: '🐉',
    feel: 'a wondrous adventure with a touch of magic, courage and discovery',
    tropes: ['a hidden door', 'a reluctant chosen one', 'a wise but tricky guide', 'a price for magic', 'an old map'],
    settings: ['an enchanted forest', 'a market of curiosities', 'a mountain kingdom', 'a lighthouse', 'a village under a spell'],
    premises: [
      'a baker finds that one of their loaves grants a single wish',
      'a child follows a fox through a door that wasn\'t there yesterday',
      'a village loses its colours and one apprentice sets out to bring them back',
      'an old map leads two siblings somewhere the map didn\'t expect',
    ],
  },
  {
    key: 'slice-of-life',
    label: 'Slice of life',
    emoji: '☕',
    feel: 'a gentle, observational story finding meaning in an ordinary day',
    tropes: ['a small kindness', 'a regular at the same café', 'an unspoken routine', 'a quiet turning point', 'noticing what others miss'],
    settings: ['a corner bakery', 'a late-night laundromat', 'a tiny bookshop', 'a park bench', 'a neighbourhood market'],
    premises: [
      'a barista slowly pieces together a regular customer\'s story',
      'a power cut turns neighbours into friends for one evening',
      'someone retraces a lost grandmother\'s favourite walk',
      'two strangers share a bench every morning and never speak — until one day',
    ],
  },
  {
    key: 'sports',
    label: 'Sports',
    emoji: '⚽',
    feel: 'an underdog story of grit, teamwork and a big final moment',
    tropes: ['the unlikely team', 'a tough coach with a soft heart', 'an injury setback', 'the rival across town', 'the final whistle'],
    settings: ['a struggling local club', 'a school gym', 'a seaside running track', 'a snowy slope', 'a city marathon'],
    premises: [
      'a last-place team gets one season to prove they belong',
      'an injured star learns to lead from the bench',
      'two rivals must run the relay together to win',
      'a shy newcomer turns out to be the team\'s missing piece',
    ],
  },
]

const BY_KEY = new Map(GENRES.map((g) => [g.key, g]))
export function genreByKey(key?: string | null): Genre | undefined {
  return key ? BY_KEY.get(key) : undefined
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function randomGenre(): Genre {
  return pick(GENRES)
}

/** A "surprise me" seed: a random genre plus a random premise + setting from it. */
export function surpriseSeed(): { genre: Genre; premise: string; setting: string } {
  const genre = randomGenre()
  return { genre, premise: pick(genre.premises), setting: pick(genre.settings) }
}

/**
 * The content-maturity guardrail injected into every story prompt. `mature` is
 * decided server-side from the learner's verified age (adults only) — minors
 * always get the general-audience setting.
 */
export function maturityHint(mature: boolean): string {
  return mature
    ? `This story is for an ADULT reader: you may write direct, intense, dark and graphic fiction — real ` +
      `danger, violence, conflict, fear, grief, mature themes and strong language — where the plot calls ` +
      `for it; don't sanitise it. Keep any romance or sexual content suggestive only (tension, fade to ` +
      `black) — do NOT write sexually explicit descriptions. Never include sexual content involving minors, ` +
      `and no hateful content targeting real groups.`
    : `Keep it appropriate for a general audience: no graphic violence, sexual content or hate; handle ` +
      `sensitive themes (e.g. bullying) constructively.`
}

/** Build the genre guidance injected into the story prompt. */
export function genrePromptHint(genre: Genre, premise?: string, mature = false): string {
  const tropes = [...genre.tropes].sort(() => Math.random() - 0.5).slice(0, 3).join('; ')
  const setting = pick(genre.settings)
  const seed = premise || pick(genre.premises)
  return (
    `Genre: ${genre.label} — ${genre.feel}. ` +
    `Set it in ${setting}. Build the plot from this seed: "${seed}". ` +
    `Weave in genre devices such as: ${tropes}. ` +
    `Give it a REAL arc (setup → complication → turning point → resolution), a clear hook, ` +
    `and characters with believable feelings. ${maturityHint(mature)}`
  )
}
