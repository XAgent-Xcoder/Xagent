/**
 * Model Scheduling — priority queue with per-endpoint adaptive concurrency.
 *
 * Borrowed from Linger (`apps/node-services/src/agent/runner-gateway/model-queue.ts`):
 *   - priority ordering (urgent > normal > low)
 *   - endpoint-class concurrency caps: subscription endpoints run wide,
 *     API/pay-as-you-go endpoints run narrow and probe their way up
 *   - `probedConcurrencyRange`: verified 1 → {1,1}; N → {N, max(N,8)}
 *
 * The scheduler is transport-agnostic: callers submit tasks that return a
 * promise; the scheduler enforces per-endpoint in-flight caps and raises the
 * cap after a clean batch so an idle, unattended Host never overspends an API
 * quota while a subscription stays fully parallel.
 */

export type ModelTaskPriority = 'urgent' | 'normal' | 'low'

export type EndpointClass = 'subscription' | 'api'

export interface ModelTask<T = unknown> {
  endpoint: string
  priority: ModelTaskPriority
  run: (signal: AbortSignal) => Promise<T>
}

export interface EndpointState {
  endpoint: string
  kind: EndpointClass
  verified: number
  max: number
  inFlight: number
}

const PRIORITY_ORDER = ['urgent', 'normal', 'low'] as const

/** subscription: wide and fixed. api: narrow floor, probes up to a ceiling. */
const CLASS_CAPS: Record<EndpointClass, { min: number; max: number }> = {
  subscription: { min: 10, max: 10 },
  api: { min: 1, max: 8 },
}

/** Mirror of Linger's probedConcurrencyRange: verified 1 → {1,1}, else {N, max(N,8)}. */
export function probedConcurrencyRange(verified: number, kind: EndpointClass): { verified: number; max: number } {
  if (kind === 'subscription') return { verified: CLASS_CAPS.subscription.min, max: CLASS_CAPS.subscription.max }
  if (verified <= 1) return { verified: 1, max: 1 }
  return { verified, max: Math.max(verified, 8) }
}

interface QueuedTask {
  task: ModelTask
  settle: (outcome: { ok?: unknown; err?: Error }) => void
}

export interface ModelScheduler {
  /** Submit a task; resolves with its value, rejects on task failure. */
  enqueue<T>(task: ModelTask<T>): Promise<T>
  /** Number of tasks waiting for a slot. */
  waiting(): number
  /** Live per-endpoint concurrency snapshot. */
  endpoints(): readonly EndpointState[]
  /** Abort all in-flight and queued work (e.g. Host shutdown). */
  close(): void
}

export function createModelScheduler(kind: EndpointClass = 'api'): ModelScheduler {
  const queues = new Map<ModelTaskPriority, QueuedTask[]>()
  for (const p of PRIORITY_ORDER) queues.set(p, [])
  const endpointState = new Map<string, EndpointState>()
  let closed = false
  let processing = false

  const stateFor = (endpoint: string): EndpointState => {
    const existing = endpointState.get(endpoint)
    if (existing) return existing
    const range = probedConcurrencyRange(kind === 'subscription' ? CLASS_CAPS.subscription.min : 1, kind)
    const state: EndpointState = { endpoint, kind, verified: range.verified, max: range.max, inFlight: 0 }
    endpointState.set(endpoint, state)
    return state
  }

  const runPicked = (picked: QueuedTask): void => {
    const state = stateFor(picked.task.endpoint)
    state.inFlight += 1
    void picked.task.run(AbortSignal.timeout(10 * 60_000)).then(
      (value) => {
        state.inFlight = Math.max(0, state.inFlight - 1)
        // A clean completion verifies the current cap and probes upward.
        const range = probedConcurrencyRange(state.verified, state.kind)
        if (range.max > state.max) state.max = range.max
        picked.settle({ ok: value })
        void drain().catch(() => undefined)
      },
      (error: Error) => {
        state.inFlight = Math.max(0, state.inFlight - 1)
        // A failed batch never raises the cap; the endpoint retries at its
        // verified level on the next drain.
        picked.settle({ err: error })
        void drain().catch(() => undefined)
      },
    )
  }

  const drain = (): void => {
    if (processing || closed) return
    processing = true
    try {
      for (;;) {
        let picked: QueuedTask | null = null
        for (const priority of PRIORITY_ORDER) {
          const queue = queues.get(priority)!
          for (let i = 0; i < queue.length; i++) {
            if (stateFor(queue[i].task.endpoint).inFlight < stateFor(queue[i].task.endpoint).max) {
              picked = queue.splice(i, 1)[0]
              break
            }
          }
          if (picked) break
        }
        if (!picked) return
        runPicked(picked)
      }
    } finally {
      processing = false
    }
  }

  return {
    enqueue<T>(task: ModelTask<T>): Promise<T> {
      if (closed) return Promise.reject(new Error('model scheduler closed'))
      return new Promise<T>((resolve, reject) => {
        queues.get(task.priority)!.push({
          task,
          settle: (outcome) => (outcome.err === undefined ? resolve(outcome.ok as T) : reject(outcome.err)),
        })
        void drain()
      })
    },
    waiting() {
      let n = 0
      for (const queue of queues.values()) n += queue.length
      return n
    },
    endpoints() {
      return [...endpointState.values()].map((state) => ({ ...state }))
    },
    close() {
      closed = true
      for (const queue of queues.values()) queue.length = 0
    },
  }
}
