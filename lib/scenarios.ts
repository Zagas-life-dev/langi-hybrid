// Guided role-play scenarios — practical settings where Langi plays a character
// (waiter, agent…) so the learner practises real situations, not just free chat.
// Each has a few concrete GOALS the learner must accomplish; the debrief at the
// end scores which ones they managed. Client-safe (no server imports) so the
// chat UI and the AI prompts share one list.

export interface Scenario {
  key: string
  label: string
  icon: string
  setting: string
  goals: string[]
}

export const SCENARIOS: Scenario[] = [
  {
    key: 'cafe', label: 'Café', icon: '☕',
    setting: 'You are a friendly waiter at a café taking the learner’s order for food and drinks.',
    goals: ['Greet the waiter politely', 'Order a drink and something to eat', 'Ask for the bill'],
  },
  {
    key: 'directions', label: 'Directions', icon: '🗺',
    setting: 'You are a local on the street; the learner asks you how to get somewhere in town.',
    goals: ['Politely get a stranger’s attention', 'Ask how to get to a place', 'Check you understood (repeat or ask how far)'],
  },
  {
    key: 'shopping', label: 'Shopping', icon: '🛍',
    setting: 'You are a shop assistant in a clothing store helping the learner browse, ask sizes/prices, and buy.',
    goals: ['Say what you are looking for', 'Ask about a size or colour', 'Ask the price and pay'],
  },
  {
    key: 'hotel', label: 'Hotel', icon: '🏨',
    setting: 'You are a hotel receptionist checking the learner in and answering questions about the room.',
    goals: ['Say you have a reservation and give your name', 'Ask one question about the room or breakfast', 'Ask what time check-out is'],
  },
  {
    key: 'airport', label: 'Airport', icon: '✈',
    setting: 'You are an airline check-in agent helping the learner check in, with luggage and the gate.',
    goals: ['Say where you are flying to', 'Answer a question about your luggage', 'Ask which gate or what time boarding is'],
  },
  {
    key: 'interview', label: 'Job interview', icon: '💼',
    setting: 'You are an interviewer running a friendly, simple job interview with the learner.',
    goals: ['Introduce yourself', 'Describe your experience or studies', 'Ask the interviewer a question'],
  },
  {
    key: 'doctor', label: 'Doctor', icon: '🩺',
    setting: 'You are a doctor; the learner describes symptoms and you help and give simple advice.',
    goals: ['Say what hurts or how you feel', 'Say how long it has lasted', 'Ask what you should do'],
  },
]

export function scenarioByKey(key?: string | null): Scenario | null {
  return SCENARIOS.find((s) => s.key === key) || null
}
