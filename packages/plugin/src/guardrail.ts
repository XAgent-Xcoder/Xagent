/**
 * Guardrail — pre-action policy gate for remote tool / terminal dispatch.
 *
 * Borrowed from Linger's localtools native confirmation/policy
 * (`apps/computer/local-daemon/internal/linger/localtools/{cua_service.go,
 * agent_browser.go, context/resolver.go}`) plus its per-provider tool-permission
 * review (Pi does not re-review; Antigravity re-reviews when requesting a
 * permission). xagent already gates *whether an endpoint may be called at all*
 * (allowlist in terminal-policy.ts / remote-tools.ts). This module adds the
 * orthogonal question: *should this particular invocation be let through right
 * now* — a deterministic rule pass, then an optional LLM second opinion for
 * high-risk actions that no rule settled.
 *
 * Additive: wire `guardrail.review(action)` into the dispatch path before the
 * existing allowlist check runs; a `deny` becomes a PERMISSION_DENIED, a
 * `review` with no reviewer is treated as `allow` (fail-open, matching the
 * existing "no permission prompt" posture), and an explicit `allow` is a no-op.
 */

export type GuardrailActionKind = 'terminal-write' | 'terminal-create' | 'tool-call' | 'file-op' | 'workspace-transfer'

export interface GuardrailAction {
  kind: GuardrailActionKind
  /** Command line or tool name being dispatched. */
  command?: string
  /** Typert endpoint, e.g. `terminal/write`, `workspace.upload.v1`. */
  endpoint?: string
  /** Target path or resource the action touches. */
  target?: string
  /** Free-form context passed to the optional reviewer. */
  args?: Record<string, unknown>
}

export interface GuardrailDecision {
  allow: boolean
  /** Which rule (or `llm`) produced the decision; `none` means fail-open. */
  rule?: string
  reason: string
}

export interface GuardrailRule {
  /** Stable identifier used in the decision's `rule` field. */
  id: string
  /** Matches an action; return true to apply this rule's disposition. */
  match: (action: GuardrailAction) => boolean
  disposition: 'allow' | 'deny' | 'review'
  reason: string
}

/** Injected LLM second opinion. Absent → `review` dispositions fail open. */
export type GuardrailReviewer = (action: GuardrailAction, context: { matchedRules: string[] }) => Promise<{ allow: boolean; reason: string }>

export interface Guardrail {
  /** Async gate: rule pass, then the optional LLM second opinion. */
  review(action: GuardrailAction): Promise<GuardrailDecision>
  /** Synchronous rule pass only (for dispatch paths that cannot await); `review` fails open. */
  reviewSync(action: GuardrailAction): GuardrailDecision
  /** Append a rule at runtime (host settings can tighten the policy). */
  addRule(rule: GuardrailRule): void
  rules(): readonly GuardrailRule[]
}

/**
 * Default high-risk patterns. Kept intentionally narrow so the allowlist stays
 * the primary control; these only add a review/deny for clearly destructive
 * invocations the allowlist would otherwise pass.
 */
export const DEFAULT_GUARDRAIL_RULES: readonly GuardrailRule[] = [
  {
    id: 'rm-recursive-root',
    match: (a) => /^rm\s+(-[a-z]*\s+)*(-[a-z]*r[a-z]*\s+)*\/(\s|$)/.test(a.command ?? '') || /^sudo\s+rm\s+-rf\s+\/\s*$/i.test(a.command ?? ''),
    disposition: 'deny',
    reason: 'recursive remove of the filesystem root requires explicit re-approval',
  },
  {
    id: 'force-push-remote',
    match: (a) => /git\s+push\s+(-[a-z]+\s+)*--force/i.test(a.command ?? '') || /git\s+push\s+.*-f\b/i.test(a.command ?? ''),
    disposition: 'review',
    reason: 'force push rewrites shared history',
  },
  {
    id: 'disk-wipe',
    match: (a) => /mkfs\.|\bdd\s+.*of=\/dev\/|shred\s+/.test(a.command ?? ''),
    disposition: 'deny',
    reason: 'raw disk write / filesystem format is destructive',
  },
  {
    id: 'credential-exfil',
    match: (a) => /(curl|wget)\b.*\b(curl|wget)\b|\bnc\s+-l\b|\bbase64\s+.*\|.*curl/.test(a.command ?? '') || /api[_-]?key|secret|token/i.test(a.command ?? '') && /upload|push|post/i.test(a.command ?? ''),
    disposition: 'review',
    reason: 'possible credential exfiltration pattern',
  },
]

export function createGuardrail(rules: readonly GuardrailRule[] = DEFAULT_GUARDRAIL_RULES, reviewer?: GuardrailReviewer): Guardrail {
  const active: GuardrailRule[] = [...rules]
  // Rule pass only: deny > allow > review(fail-open) > none.
  const rulePass = (action: GuardrailAction, matched: GuardrailRule[]): GuardrailDecision | null => {
    const deny = matched.find((r) => r.disposition === 'deny')
    if (deny) return { allow: false, rule: deny.id, reason: deny.reason }
    const allow = matched.find((r) => r.disposition === 'allow')
    if (allow) return { allow: true, rule: allow.id, reason: allow.reason }
    const review = matched.find((r) => r.disposition === 'review')
    if (review) return { allow: true, rule: review.id, reason: `no reviewer on this path; failing open (${review.reason})` }
    return null
  }
  return {
    async review(action) {
      const matched: GuardrailRule[] = []
      for (const rule of active) if (rule.match(action)) matched.push(rule)
      const settled = rulePass(action, matched)
      if (settled) return settled
      const review = matched.find((r) => r.disposition === 'review')
      if (!review || !reviewer) return { allow: true, rule: 'none', reason: 'no rule matched' }
      try {
        const verdict = await reviewer(action, { matchedRules: matched.map((r) => r.id) })
        return { allow: verdict.allow, rule: 'llm', reason: verdict.reason }
      } catch {
        // Reviewer outage fails open to match the existing no-prompt posture.
        return { allow: true, rule: review.id, reason: `reviewer error; failing open (${review.reason})` }
      }
    },
    reviewSync(action) {
      const matched: GuardrailRule[] = []
      for (const rule of active) if (rule.match(action)) matched.push(rule)
      return rulePass(action, matched) ?? { allow: true, rule: 'none', reason: 'no rule matched' }
    },
    addRule(rule) {
      active.push(rule)
    },
    rules() {
      return active
    },
  }
}
