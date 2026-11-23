'use client'
// Day 0 hello-world for Langi Hybrid: one Firebase AI Logic call per task, showing
// whether it ran on-device (Gemini Nano) or in the cloud, plus the HUD totals.
import { useEffect, useState } from 'react'
import { Schema } from 'firebase/ai'
import { firebaseConfigured } from '@/lib/hybrid/firebase'
import { deviceDiagnostics, deviceStatus, enableOnDevice, runTask, warmUpDevice, type DeviceDiagnostics, type DeviceStatus } from '@/lib/hybrid/ai'
import { formatBytes, useHud } from '@/lib/hybrid/hud'
import { DEFAULT_RULES, type HybridTask } from '@/lib/hybrid/tasks'

const correctionSchema = Schema.object({
  properties: {
    corrected: Schema.string(),
    mistakes: Schema.array({
      items: Schema.object({ properties: { wrong: Schema.string(), right: Schema.string(), why: Schema.string() } }),
    }),
  },
})

const PRESETS: Record<HybridTask, { instructions: string; sample: string; json?: boolean }> = {
  liveCorrect: {
    // Plain text, no JSON schema: constrained decoding and JSON punctuation cost Nano seconds.
    instructions: `Fix this French from an English-speaking learner. Line 1: the corrected sentence. Then one short line per mistake: wrong -> right (3-6 word English reason). Fix tense and agreement too. If it is already correct, reply only: OK.
Example input: Hier je mange une pomme.
Example output:
Hier, j'ai mangé une pomme.
je mange -> j'ai mangé (past tense)`,
    sample: 'Je suis allé au marché hier et je achète des pommes.',
  },
  explain: {
    instructions: 'Explain this French word or phrase to an English-speaking beginner in at most 3 short lines: meaning, grammar note, one example.',
    sample: 'en train de',
  },
  grade: {
    instructions: 'The learner was asked to translate "the cat" into French. Reply with "correct" or "wrong" and one short reason.',
    sample: 'le chatte',
  },
  deepDive: {
    instructions: 'Give a full grammar breakdown in English of the mistake in this French sentence, with the rule, 3 examples and a common trap.',
    sample: 'Si j’aurais su, je serais venu.',
  },
  chat: {
    instructions: 'You are Langi, a friendly French tutor. Reply only in simple French (A2), max 2 sentences.',
    sample: 'Bonjour ! Je m’appelle Ada.',
  },
  classify: {
    instructions: 'Label the CEFR level (A1, A2, B1, B2) of this French sentence. Reply with the label only.',
    sample: 'Bien que je sois fatigué, je vais continuer.',
  },
}

export default function HybridLab() {
  const [status, setStatus] = useState<DeviceStatus | 'checking'>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const [task, setTask] = useState<HybridTask>('liveCorrect')
  const [input, setInput] = useState(PRESETS.liveCorrect.sample)
  const [out, setOut] = useState<{ text: string; source: string; reason: string; ms: number; firstTokenMs: number | null; live?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [nanoOnly, setNanoOnly] = useState(true)
  const [warmMs, setWarmMs] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const hud = useHud()
  const configured = firebaseConfigured()

  const [diag, setDiag] = useState<DeviceDiagnostics | null>(null)
  useEffect(() => {
    deviceStatus().then(setStatus)
    deviceDiagnostics().then(setDiag)
    warmUpDevice().then(setWarmMs)
  }, [])

  async function enable() {
    setErr('')
    setProgress(0)
    setStatus('downloading')
    // Status poll in case Chrome sends no progress events (it can sit at 0% while unpacking).
    const poll = setInterval(async () => {
      const s = await deviceStatus()
      setStatus(s)
      deviceDiagnostics().then(setDiag)
      if (s === 'available') clearInterval(poll)
    }, 2000)
    try {
      await enableOnDevice((p) => setProgress(p))
      setStatus(await deviceStatus())
    } catch (e) {
      setErr((e as Error).message)
      setStatus(await deviceStatus())
    } finally {
      clearInterval(poll)
      setProgress(null)
    }
  }

  async function run() {
    setBusy(true); setErr(''); setOut(null)
    try {
      const p = PRESETS[task]
      const r = await runTask(task, input, {
        instructions: p.instructions,
        schema: p.json ? correctionSchema : undefined,
        nanoOnly,
        onText: (soFar) => setOut({ text: soFar, source: nanoOnly ? 'ON_DEVICE' : 'IN_CLOUD', reason: 'streaming…', ms: 0, firstTokenMs: null, live: true }),
      })
      setOut({ text: r.text, source: r.source, reason: r.event.reason, ms: r.event.ms, firstTokenMs: r.firstTokenMs })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Hybrid Lab</h1>
        <p className="text-sm opacity-70">Every call goes through Firebase AI Logic. The badge shows where it ran.</p>
      </header>

      {!configured && (
        <p className="rounded-lg border border-amber-500 bg-amber-500/10 p-3 text-sm">
          Firebase not configured. Add the <code>NEXT_PUBLIC_FIREBASE_*</code> and
          <code> NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY</code> values to <code>.env.local</code>, then restart.
        </p>
      )}

      <section className="rounded-xl border p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Gemini Nano on this device</div>
            <div className="text-sm opacity-70">Status: <b data-testid="device-status">{status}</b></div>
          </div>
          {(status === 'downloadable' || (status === 'downloading' && progress === null)) && (
            <button onClick={enable} className="rounded-lg bg-black px-3 py-2 text-white dark:bg-white dark:text-black">
              {status === 'downloading' ? 'Resume download' : 'Enable on-device AI'}
            </button>
          )}
        </div>
        {progress !== null && (
          <div className="space-y-1 text-sm">
            <div>
              {progress === 0 ? 'Starting download (about 4 GB, can take a while)…'
                : progress < 1 ? `Downloading Gemini Nano: ${Math.round(progress * 100)}%`
                : 'Download done, unpacking…'}
            </div>
            <div className="h-2 overflow-hidden rounded bg-black/10 dark:bg-white/10">
              <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.max(2, progress * 100)}%` }} />
            </div>
            <div className="text-xs opacity-60">Exact progress: chrome://on-device-internals</div>
          </div>
        )}
        {status === 'available' && <p className="text-sm text-emerald-600">Gemini Nano is ready. On-device tasks now run locally.{warmMs !== null && ` Model warmed in ${warmMs} ms.`}</p>}
        {diag && (
          <div data-testid="device-diag" className="text-xs opacity-70">
            Chrome {diag.chrome ?? 'not detected'} · Prompt API: {diag.hasPromptApi ? 'yes' : 'no'} ·
            plain: {diag.plain} · en: {diag.english} · en+fr: {diag.french}
          </div>
        )}
        {status === 'unsupported' && (
          <p className="text-sm opacity-70">This browser has no Prompt API. Use Chrome 139+ on desktop. Cloud mode still works.</p>
        )}
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <label className="block text-sm font-semibold">
          Task
          <select
            value={task}
            onChange={(e) => { const t = e.target.value as HybridTask; setTask(t); setInput(PRESETS[t].sample); setOut(null) }}
            className="mt-1 block w-full rounded-lg border bg-transparent p-2"
          >
            {(Object.keys(PRESETS) as HybridTask[]).map((t) => (
              <option key={t} value={t}>{t} ({DEFAULT_RULES[t].mode.replaceAll('_', ' ')})</option>
            ))}
          </select>
        </label>
        <textarea
          lang="fr"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          className="block w-full rounded-lg border bg-transparent p-2"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={nanoOnly} onChange={(e) => setNanoOnly(e.target.checked)} />
          Nano only (no cloud fallback, shows the real error)
        </label>
        <button
          onClick={run}
          disabled={busy || !configured}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? 'Running…' : 'Run'}
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {out && (
          <div className="space-y-2">
            <span
              data-testid="source-badge"
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${out.source === 'ON_DEVICE' ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'}`}
            >
              {out.source === 'ON_DEVICE' ? 'On-device' : 'Cloud'} · {out.live ? 'streaming…' : `${out.ms} ms total · first text ${out.firstTokenMs ?? '-'} ms · ${out.reason}`}
            </span>
            <pre className="whitespace-pre-wrap rounded-lg bg-black/5 p-3 text-sm dark:bg-white/10">{out.text}</pre>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4 text-sm">
        <div className="font-semibold">Hybrid HUD (this session)</div>
        <div>On-device calls: {hud.onDevice} · Cloud calls: {hud.cloud}</div>
        <div>Data saved: {formatBytes(hud.savedBytes)} · Cost saved: ${hud.savedUsd.toFixed(5)}</div>
      </section>
    </main>
  )
}
