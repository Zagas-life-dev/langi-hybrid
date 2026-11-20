// Pure helpers for on-device review grading (no Firebase imports, unit-testable).

export interface Verdict { accepted: boolean; reason: string }

/** Prompt for the on-device judge. recognition: learner translates a foreign word into their language. */
export function judgeInstructions(args: { learningName: string; nativeName: string; direction: 'recognition' | 'production' }): string {
  const task = args.direction === 'recognition'
    ? `The learner saw a ${args.learningName} word and typed its meaning in ${args.nativeName}.`
    : `The learner saw a ${args.nativeName} word and typed the ${args.learningName} word for it.`
  return `${task} Decide if their answer is an acceptable answer: same meaning, a valid synonym, or a harmless typo or missing accent. ` +
    `A different meaning is WRONG. Reply on two lines. Line 1: ACCEPT or REJECT. Line 2: a reason of at most 10 words in ${args.nativeName}.`
}

/** Parse "ACCEPT / REJECT + reason". Unclear replies are rejected, so the rules' verdict stands. */
export function parseVerdict(raw: string): Verdict {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const head = (lines[0] || '').toUpperCase()
  const accepted = /^(ACCEPT|ACCEPTED|YES|CORRECT)\b/.test(head) && !/\b(REJECT|WRONG|NO)\b/.test(head)
  const inline = lines[0]?.replace(/^(ACCEPT(ED)?|REJECT(ED)?|YES|NO|CORRECT|WRONG)\b[\s:.\-—]*/i, '').trim()
  const reason = (lines[1] || inline || '').replace(/^reason\s*:\s*/i, '').slice(0, 140)
  return { accepted, reason }
}
