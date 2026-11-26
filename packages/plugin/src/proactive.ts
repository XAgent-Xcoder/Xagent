/**
 * Proactive — nightly rule learning + push evaluation for the Host agent.
 *
 * Borrowed from Linger (`apps/node-services/src/agent/agent-features/proactive/*`
 * + `src/memory/proactive-dreaming.ts`, prompts under `prompts/proactive/`).
 * The decision itself is prompt engineering: the judge builds a prompt and the
 * LLM decides; this module owns the *loop* — recording user feedback as clues,
 * consolidating clues into durable rules once a night (the "dreaming" pass),
 * and deciding what is worth pushing to the phone right now.
 *
 * Push channel: the module receives a `push` callback; wiring it to the iOS
 * VoIP wake (see Xagent-IOS `VoIPKeepAlive.swift`) is the transport-side step.
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { PersistentMemory } from './persistent-memory.js'

export const ProactiveRuleSchema = z.object({
  id: z.string().uuid(),
  /** Human-readable condition the rule applies to. */
  condition: z.string().min(1).max(512),
  disposition: z.enum(['notify', 'suppress', 'escalate']),
  confidence: z.number().min(0).max(1).default(0.5),
  learnedFrom: z.array(z.string().min(1)).default([]),
  createdAt: z.number().int().nonnegative(),
}).strict()
export type ProactiveRule = z.infer<typeof ProactiveRuleSchema>

export interface ProactiveClue {
  id: string
  context: string
  userSignal: 'informed' | 'noisy' | 'ignored' | 'acted'
  observedAt: number
}

/** Build the evaluation prompt; the LLM makes the actual call. */
export function buildJudgePrompt(context: string, rules: readonly ProactiveRule[]): string {
  const ruleLines = rules.length > 0
    ? rules.map((r) => `- [${r.disposition}] (${r.confidence.toFixed(2)}) ${r.condition}`).join('\n')
    : '(no learned rules yet)'
  return [
    'You are the proactive judge. Decide whether the Host should proactively notify the user now.',
    'Return ONLY a JSON object: {"notify": boolean, "reason": string, "urgency": "low"|"normal"|"high"}.',
    '',
    'Current context:',
    context,
    '',
    'Learned rules (apply by confidence, highest first):',
    ruleLines,
  ].join('\n')
}

/** Parse the judge's JSON verdict; tolerant of prose-wrapped JSON. */
export function parseJudgeVerdict(raw: string): { notify: boolean; reason: string; urgency: 'low' | 'normal' | 'high' } {
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { notify?: unknown; reason?: unknown; urgency?: unknown }
      const urgency = parsed.urgency === 'low' || parsed.urgency === 'high' ? parsed.urgency : 'normal'
      return { notify: parsed.notify === true, reason: typeof parsed.reason === 'string' ? parsed.reason : '', urgency }
    } catch { /* fall through */ }
  }
  return { notify: false, reason: 'unreadable judge verdict', urgency: 'normal' }
}

export interface ProactivePush {
  /** Deliver a notification to the phone (transport is the caller's concern). */
  send: (title: string, body: string, urgency: 'low' | 'normal' | 'high') => Promise<void>
}

export interface ProactiveOptions {
  memory: PersistentMemory
  /** LLM judge; the deterministic fallback never notifies. */
  judge?: (prompt: string) => Promise<string>
  push?: ProactivePush
}

export class Proactive {
  private ruleList: ProactiveRule[] = []
  private clues: ProactiveClue[] = []
  private readonly memory: PersistentMemory
  private readonly judge?: ProactiveOptions['judge']
  private readonly push?: ProactivePush

  constructor(options: ProactiveOptions) {
    this.memory = options.memory
    this.judge = options.judge
    this.push = options.push
  }

  async load(): Promise<void> {
    const stored = await this.memory.entries()
    // Rules were persisted as kind 'preference' entries tagged 'proactive-rule'.
    this.ruleList = stored
      .filter((e) => e.source === 'proactive-rule')
      .map((e) => ProactiveRuleSchema.safeParse(JSON.parse(e.text)))
      .filter((r) => r.success)
      .map((r) => r.data)
  }

  private async saveRules(): Promise<void> {
    await this.forgetRuleEntries()
    for (const rule of this.ruleList) await this.memory.remember({ kind: 'preference', text: JSON.stringify(rule), source: 'proactive-rule' })
  }

  private async forgetRuleEntries(): Promise<void> {
    const stored = await this.memory.entries()
    for (const e of stored.filter((entry) => entry.source === 'proactive-rule')) await this.memory.forget(e.id)
  }

  recordClue(clue: Omit<ProactiveClue, 'id' | 'observedAt'>): void {
    this.clues.push({ ...clue, id: randomUUID(), observedAt: Date.now() })
  }

  /** Decide now whether to push. Deterministic fallback: notify only on high-urgency context. */
  async evaluate(context: string): Promise<{ notify: boolean; reason: string; urgency: 'low' | 'normal' | 'high' }> {
    if (this.judge) {
      const verdict = parseJudgeVerdict(await this.judge(buildJudgePrompt(context, this.ruleList)))
      if (verdict.notify && this.push) await this.push.send('Proactive', verdict.reason, verdict.urgency)
      return verdict
    }
    return { notify: false, reason: 'no judge configured', urgency: 'normal' }
  }

  /**
   * The nightly "dreaming" pass: consolidate accumulated clues into rules.
   * Without an LLM judge this is deterministic — repeated 'noisy' signals on a
   * context prefix become a suppress rule, repeated 'informed' become notify.
   */
  async consolidateNight(): Promise<{ rules: number }> {
    if (this.clues.length === 0) return { rules: this.ruleList.length }
    const bySignal = new Map<string, ProactiveClue[]>()
    for (const clue of this.clues) {
      const prefix = clue.context.slice(0, 64)
      bySignal.set(prefix, [...(bySignal.get(prefix) ?? []), clue])
    }
    for (const [prefix, group] of bySignal) {
      const noisy = group.filter((c) => c.userSignal === 'noisy').length
      const informed = group.filter((c) => c.userSignal === 'informed').length
      if (noisy >= 2 && noisy > informed) this.upsertRule(prefix, 'suppress', group)
      else if (informed >= 2 && informed > noisy) this.upsertRule(prefix, 'notify', group)
    }
    this.clues = []
    await this.saveRules()
    return { rules: this.ruleList.length }
  }

  private upsertRule(condition: string, disposition: ProactiveRule['disposition'], group: readonly ProactiveClue[]): void {
    const existing = this.ruleList.find((r) => r.condition === condition)
    const learnedFrom = group.map((c) => c.id)
    if (existing) {
      existing.disposition = disposition
      existing.confidence = Math.min(1, existing.confidence + 0.1)
      existing.learnedFrom = [...new Set([...existing.learnedFrom, ...learnedFrom])]
    } else {
      this.ruleList.push({
        id: randomUUID(), condition, disposition, confidence: 0.5,
        learnedFrom, createdAt: Date.now(),
      })
    }
  }

  rules(): readonly ProactiveRule[] {
    return this.ruleList
  }
}

export function createProactive(options: ProactiveOptions): Proactive {
  return new Proactive(options)
}
