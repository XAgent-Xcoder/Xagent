import { spawn } from 'node:child_process'
import { delimiter } from 'node:path'

// Ported in spirit from Orca src/main/startup/shell-environment/login-shell-environment.ts:
// a GUI host's process.env lacks the login shell's exports (proxy endpoint/auth, PATH),
// so managed agents must inherit the captured shell environment to reach the same backend.
const START = '__XAGENT_LOGIN_SHELL_ENV_START__'
const END = '__XAGENT_LOGIN_SHELL_ENV_END__'
const SPAWN_TIMEOUT_MS = 5000
const REFRESH_AFTER_MS = 10_000

export interface LoginShellEnvironmentCapture { status: 'captured' | 'fallback'; env: NodeJS.ProcessEnv }

let last: LoginShellEnvironmentCapture | undefined
let attemptedAt = -Infinity
let running: Promise<LoginShellEnvironmentCapture> | undefined

function definedEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined))
}

function loginShell(): string | null {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe'
  return process.env.SHELL || '/bin/zsh'
}

function probeArgs(shell: string): string[] {
  if (process.platform !== 'win32') return ['-ilc', `printf '\\0${START}\\0'; /usr/bin/env -0; printf '\\0${END}\\0'`]
  const dump = `$v=@{};[Environment]::GetEnvironmentVariables().GetEnumerator()|ForEach-Object{$v[[string]$_.Key]=[string]$_.Value};[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);[Console]::Write('${START}');[Console]::Write(($v|ConvertTo-Json -Compress));[Console]::Write('${END}')`
  return /powershell|pwsh/i.test(shell) ? ['-NoLogo', '-Command', dump] : ['-ilc', `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(dump, 'utf16le').toString('base64')}`]
}

function parse(output: Buffer): NodeJS.ProcessEnv | null {
  if (process.platform === 'win32') {
    const text = output.toString('utf8')
    const start = text.indexOf(START)
    const end = text.indexOf(END, start + START.length)
    if (start === -1 || end === -1) return null
    try {
      const parsed = JSON.parse(text.slice(start + START.length, end)) as Record<string, unknown>
      const entries = Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string')
      return entries.length ? Object.fromEntries(entries) : null
    } catch { return null }
  }
  const start = output.indexOf(Buffer.from(`\0${START}\0`))
  const end = output.indexOf(Buffer.from(`\0${END}\0`), start + START.length + 2)
  if (start === -1 || end === -1) return null
  const env: NodeJS.ProcessEnv = {}
  for (const entry of output.subarray(start + START.length + 2, end).toString('utf8').split('\0')) {
    const separator = entry.indexOf('=')
    if (separator > 0) env[entry.slice(0, separator)] = entry.slice(separator + 1)
  }
  return Object.keys(env).length ? env : null
}

function capture(shell: string): Promise<NodeJS.ProcessEnv | null> {
  return new Promise(resolve => {
    let settled = false
    const chunks: Buffer[] = []
    const finish = (value: NodeJS.ProcessEnv | null) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value) } }
    const child = spawn(shell, probeArgs(shell), { env: definedEnv(process.env), stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    const timer = setTimeout(() => { child.kill(); finish(null) }, SPAWN_TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stdout.on('error', () => finish(null))
    child.on('error', () => finish(null))
    child.on('close', () => finish(parse(Buffer.concat(chunks))))
  })
}

function unionPath(captured: NodeJS.ProcessEnv, host: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const segments = [captured.PATH, host.PATH].flatMap(value => value?.split(delimiter) ?? [])
  return { ...captured, PATH: [...new Set(segments.filter(Boolean))].join(delimiter) }
}

function run(): Promise<LoginShellEnvironmentCapture> {
  const startedAt = Date.now()
  const shell = loginShell()
  const fallback: LoginShellEnvironmentCapture = { status: 'fallback', env: definedEnv(process.env) }
  const task = (shell ? capture(shell) : Promise.resolve(null))
    .then(captured => captured ? { status: 'captured' as const, env: unionPath(captured, definedEnv(process.env)) } : fallback)
    .catch(() => fallback)
    .then(result => {
      if (running === task) running = undefined
      if (startedAt >= attemptedAt) {
        attemptedAt = startedAt
        if (result.status === 'captured' || last?.status !== 'captured') last = result
      }
      return result
    })
  running = task
  return task
}

/** Synchronous read of the last capture; kicks a background refresh when stale so callers never block. */
export function loginShellEnvironmentSync(): NodeJS.ProcessEnv {
  if (!last) { void run(); return definedEnv(process.env) }
  if (Date.now() - attemptedAt >= REFRESH_AFTER_MS && !running && last.status !== 'captured') void run()
  return last.env
}

/** Warm/refresh the capture ahead of a launch (fire-and-forget at host startup). */
export function refreshLoginShellEnvironment(): Promise<LoginShellEnvironmentCapture> {
  return running ?? run()
}
