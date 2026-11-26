/**
 * Desktop Takeover — drive the user's real, already-logged-in Chrome over CDP.
 *
 * Borrowed from Linger's localtools native browser
 * (`apps/computer/local-daemon/internal/linger/localtools/native_browser.go:216`,
 * `native_cdp.go:158` — a CDP `DialContext` to the user's browser websocket
 * endpoint rather than a fresh VM). xagent's remote agent can therefore operate
 * the real desktop browser (cookies, sessions, local profiles intact) instead of
 * a clean-room instance.
 *
 * Transport-agnostic: the Host launches Chrome with `--remote-debugging-port`
 * (or attaches to an existing one) and hands this module the per-target
 * `webSocketDebuggerUrl` from `http://127.0.0.1:<port>/json`. The client speaks
 * the Chrome DevTools Protocol over the global WebSocket (Node 22+ / Electron).
 */

import { createHash } from 'node:crypto'

export interface CdpConnection {
  /** Send a CDP command; resolves with the `result` field, rejects on `error`. */
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
  /** Subscribe to CDP events; returns an unsubscribe function. */
  on(event: string, handler: (params: unknown) => void): () => void
  /** The target (tab) this connection is bound to. */
  readonly targetId: string
  /** Close the connection. */
  close(): void
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

/** Attach to a single Chrome target (tab) via its CDP WebSocket endpoint. */
export async function connectCdp(wsEndpoint: string): Promise<CdpConnection> {
  const socket = new WebSocket(wsEndpoint)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error(`CDP connect failed: ${wsEndpoint}`)), { once: true })
  })
  let seq = 0
  const pending = new Map<number, Pending>()
  const listeners = new Map<string, Set<(params: unknown) => void>>()
  socket.addEventListener('message', (event) => {
    let frame: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string } }
    try {
      frame = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
    } catch {
      return
    }
    if (frame.id !== undefined) {
      const call = pending.get(frame.id)
      if (!call) return
      pending.delete(frame.id)
      if (frame.error) call.reject(new Error(`CDP ${frame.error.code}: ${frame.error.message}`))
      else call.resolve(frame.result)
    } else if (frame.method !== undefined) {
      listeners.get(frame.method)?.forEach((handler) => handler(frame.params))
    }
  })
  const targetId = createHash('sha1').update(wsEndpoint).digest('hex').slice(0, 16)
  return {
    targetId,
    send<T>(method, params) {
      const id = ++seq
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: (v) => resolve(v as T), reject })
        socket.send(JSON.stringify({ id, method, params: params ?? {} }))
      })
    },
    on(event, handler) {
      const set = listeners.get(event) ?? new Set()
      set.add(handler)
      listeners.set(event, set)
      return () => set.delete(handler)
    },
    close() {
      for (const call of pending.values()) call.reject(new Error('CDP connection closed'))
      pending.clear()
      listeners.clear()
      socket.close()
    },
  }
}

/** List open targets (tabs) from a running Chrome's /json endpoint. */
export async function listCdpTargets(httpOrigin: string): Promise<Array<{ id: string; title: string; url: string; webSocketDebuggerUrl: string }>> {
  const response = await fetch(`${httpOrigin.replace(/\/$/, '')}/json`)
  if (!response.ok) throw new Error(`CDP /json returned ${response.status}`)
  const targets = (await response.json()) as Array<{ id: string; title?: string; url?: string; webSocketDebuggerUrl?: string }>
  return targets
    .filter((t) => typeof t.webSocketDebuggerUrl === 'string')
    .map((t) => ({ id: t.id, title: t.title ?? '', url: t.url ?? '', webSocketDebuggerUrl: t.webSocketDebuggerUrl as string }))
}

/** Open a new tab via the browser-level CDP endpoint and attach to it. */
export async function openCdpTab(httpOrigin: string, url = 'about:blank'): Promise<CdpConnection> {
  const origin = httpOrigin.replace(/\/$/, '')
  const response = await fetch(`${origin}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`CDP /json/new returned ${response.status}`)
  const target = (await response.json()) as { webSocketDebuggerUrl?: string }
  if (!target.webSocketDebuggerUrl) throw new Error('CDP /json/new returned no WebSocket endpoint')
  return connectCdp(target.webSocketDebuggerUrl)
}

/** High-level helpers over a connected target. */
export function tabActions(connection: CdpConnection) {
  return {
    async navigate(url: string): Promise<void> {
      await connection.send('Page.enable')
      await connection.send('Page.navigate', { url })
    },
    async evaluate(expression: string): Promise<unknown> {
      const result = await connection.send<{ result: { value?: unknown } }>('Runtime.evaluate', { expression, returnByValue: true })
      return result?.result?.value
    },
    async title(): Promise<string> {
      const result = await connection.send<{ result: { value?: string } }>('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
      return result?.result?.value ?? ''
    },
    async url(): Promise<string> {
      const result = await connection.send<{ result: { value?: string } }>('Runtime.evaluate', { expression: 'location.href', returnByValue: true })
      return result?.result?.value ?? ''
    },
  }
}
