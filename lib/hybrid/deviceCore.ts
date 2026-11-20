// Pure wording for the on-device model state (no Firebase imports, unit-testable).
// Langi must never leave a learner stuck: with no Gemini Nano it runs in cloud-only mode, and the
// banner says so plainly and says what would turn on-device back on.

export type DeviceStatus = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available'

export interface DeviceFacts { chrome: string | null; hasPromptApi: boolean }

export interface DeviceNotice {
  /** 'ready' shows nothing; 'enable' offers the one-time download; 'cloud' explains cloud-only mode. */
  kind: 'ready' | 'enable' | 'cloud'
  title: string
  body: string
}

/** Chrome ships the built-in AI (Gemini Nano) from this major version on desktop. */
export const MIN_CHROME = 138

export function deviceNotice(status: DeviceStatus | 'checking', facts?: DeviceFacts | null): DeviceNotice {
  if (status === 'checking' || status === 'available') return { kind: 'ready', title: '', body: '' }

  if (status === 'downloadable' || status === 'downloading') {
    return {
      kind: 'enable',
      title: 'Turn on private, free AI on this device',
      body: 'Langi can check your French, explain words and grade answers on your device with Gemini Nano. It is a one-time download, and afterwards it works offline and uses no data.',
    }
  }

  // unsupported (no Prompt API at all) or unavailable (API present but this machine can't run the model)
  const chrome = facts?.chrome ? Number(facts.chrome) : null
  let why: string
  if (status === 'unavailable') {
    why = 'This computer cannot run Gemini Nano (it needs about 22 GB of free disk space and a recent processor or graphics card).'
  } else if (chrome !== null && chrome < MIN_CHROME) {
    why = `Your Chrome is version ${chrome}. Update to version ${MIN_CHROME} or newer on a desktop to use on-device AI.`
  } else if (facts && facts.chrome === null) {
    why = 'This browser does not have on-device AI. Use Chrome on a desktop computer to turn it on.'
  } else {
    why = 'On-device AI is not switched on in this browser. Use Chrome on a desktop computer.'
  }
  return {
    kind: 'cloud',
    title: 'Running in cloud-only mode',
    body: `Everything still works and is still free, but each AI action uses a little data and needs a connection. ${why}`,
  }
}
