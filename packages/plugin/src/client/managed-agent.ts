import type { ClientReact } from './types.js'
import { gptWorkspaceIcon } from './icons.js'

interface Snapshot<T> { getSnapshot(): T; subscribe(listener: () => void): () => void }
interface SessionRow { id: string; retainedBy?: Record<string, number>; agentId?: string; projections?: { values?: Record<string, unknown> } }
interface WorkspaceRow { workspaceId: string; title?: string; path?: string; sessionIds?: readonly string[] }
export interface ManagedAgentUiContext {
  sessions: { list: Snapshot<{ byId?: Record<string, SessionRow> }>; refresh?(): Promise<void> }
  workspaces: { list: Snapshot<{ items: readonly WorkspaceRow[] }> }
  call(endpoint: string, request: Record<string, unknown>): Promise<unknown>
  open(sessionId: string): void
  chinese: boolean
}
const record = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
const claudeIcon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g stroke="#D97757" stroke-width="2.2"><path d="M12 1v22M1 12h22M4.2 4.2l15.6 15.6M4.2 19.8L19.8 4.2M7.8 1.8l8.4 20.4M1.8 7.8l20.4 8.4M1.8 16.2l20.4-8.4M7.8 22.2l8.4-20.4"/></g></svg>')

// Small inline glyphs rendered with currentColor so they follow the host theme.
const refreshIcon = (React: ClientReact) => React.createElement('svg', {
  className: 'xcodexManagedAgentReloadIcon', viewBox: '0 0 16 16', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
}, React.createElement('path', { d: 'M14.5 8A6.5 6.5 0 1 1 8 1.5c2.5 0 4.6 1.4 5.7 3.4' }),
  React.createElement('path', { d: 'M13.9 1.4v3.5h-3.5' }))

const spinner = (React: ClientReact) => React.createElement('span', { className: 'xcodexManagedAgentSpinner', 'aria-hidden': true })

function agentGlyph(React: ClientReact, id: string): unknown {
  if (id === 'codex') return React.createElement('img', { className: 'xcodexManagedAgentItemIcon', src: gptWorkspaceIcon, alt: '', width: 18, height: 18 })
  if (id === 'claude' || id === 'claude-code') return React.createElement('img', { className: 'xcodexManagedAgentItemIcon', src: claudeIcon, alt: '', width: 18, height: 18 })
  return React.createElement('span', { className: 'xcodexManagedAgentItemAvatar', 'aria-hidden': true }, id.slice(0, 1).toUpperCase())
}

export function createManagedAgentUi(React: ClientReact, ctx: ManagedAgentUiContext): {
  NewSession: (props: { wide?: boolean }) => unknown
  SessionLogo: (props: { sessionId: string }) => unknown
} {
  const managedIds = new Map<string, string>()
  let catalogFlight: Promise<void> | undefined
  const catalogListeners = new Set<() => void>()
  const refreshCatalog = (): void => {
    if (catalogFlight) return
    catalogFlight = ctx.call('managedAgent/catalog', {}).then(value => {
      const items = Array.isArray(value) ? value : record(value).items
      if (!Array.isArray(items)) return
      managedIds.clear()
      for (const item of items) {
        const entry = record(item)
        if (typeof entry.sessionId === 'string' && typeof entry.agentId === 'string') managedIds.set(entry.sessionId, entry.agentId)
      }
      for (const listener of catalogListeners) listener()
    }).catch(() => { managedIds.clear(); for (const listener of catalogListeners) listener() }).finally(() => { catalogFlight = undefined })
  }
  function useSnapshots(): void {
    const [, update] = React.useState(0)
    React.useEffect(() => {
      const changed = () => update(value => value + 1)
      const a = ctx.sessions.list.subscribe(() => { changed(); refreshCatalog() })
      catalogListeners.add(changed)
      refreshCatalog()
      const b = ctx.workspaces.list.subscribe(changed)
      return () => { a(); b(); catalogListeners.delete(changed) }
    }, [])
  }
  function SessionLogo({ sessionId }: { sessionId: string }): unknown {
    useSnapshots()
    const session = ctx.sessions.list.getSnapshot().byId?.[sessionId]
    if (!session) return null
    const projected = record(session.projections?.values?.managedAgent).agentId
    const id = typeof projected === 'string' ? projected : managedIds.get(sessionId)
    if (!id || id === 'dsh' || id === 'deepseek') return null
    const src = id === 'codex' ? gptWorkspaceIcon : id === 'claude' || id === 'claude-code' ? claudeIcon : undefined
    return src ? React.createElement('img', { src, alt: id, title: id, width: 16, height: 16, style: { flexShrink: 0 } }) : React.createElement('span', { title: id, 'aria-label': id }, id.slice(0, 1).toUpperCase())
  }
  function NewSession({ wide }: { wide?: boolean }): unknown {
    useSnapshots()
    const [agents, setAgents] = React.useState<Array<{ id: string; label: string; profiles?: Array<{ id: string; label: string }> }>>([])
    const [expanded, setExpanded] = React.useState(false)
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState<string | undefined>(undefined)
    const [attempt, setAttempt] = React.useState<{ workspaceId: string; agentId: string; operationId: string; profileId?: string } | undefined>(undefined)
    const [loading, setLoading] = React.useState(true)
    const [reload, setReload] = React.useState(0)
    const [chosenWorkspace, setChosenWorkspace] = React.useState<string | undefined>(undefined)
    const [profiles, setProfiles] = React.useState<Record<string, string>>({})
    const mounted = React.useRef(false)
    const creating = React.useRef(false)
    const rootRef = React.useRef<HTMLDivElement | null>(null)
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
    React.useEffect(() => {
      let active = true
      setLoading(true); setError(undefined); setAgents([])
      void ctx.call('managedAgent/agents', {}).then(value => {
        const values = Array.isArray(value) ? value : record(value).items
        if (!Array.isArray(values)) throw new Error(ctx.chinese ? 'Agent 列表格式错误' : 'Invalid Agent list')
        if (active) setAgents(values.flatMap(item => {
          const agent = record(item)
          return typeof agent.id === 'string' && agent.available !== false ? [{ id: agent.id, label: typeof agent.name === 'string' ? agent.name : agent.id, profiles: Array.isArray(agent.profiles) ? agent.profiles.flatMap(item => { const p = record(item); return typeof p.id === 'string' && typeof p.label === 'string' ? [{ id: p.id, label: p.label }] : [] }) : [] }] : []
        }))
      }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
        .finally(() => { if (active) setLoading(false) })
      return () => { active = false }
    }, [reload])
    // Dismiss the popover on outside click / Escape, matching host menu behavior.
    React.useEffect(() => {
      if (!expanded || typeof document === 'undefined') return
      const onDown = (event: MouseEvent) => {
        if (rootRef.current && !rootRef.current.contains(event.target as Node)) setExpanded(false)
      }
      const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey)
      return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
    }, [expanded])
    const current = Object.values(ctx.sessions.list.getSnapshot().byId ?? {}).find(item => (item.retainedBy?.mainView ?? 0) > 0)
    const workspaces = ctx.workspaces.list.getSnapshot().items
    const workspace = chosenWorkspace
      ? workspaces.find(item => item.workspaceId === chosenWorkspace)
      : workspaces.find(item => current && item.sessionIds?.includes(current.id)) ?? (workspaces.length === 1 ? workspaces[0] : undefined)
    const create = async (agentId: string): Promise<void> => {
      if (creating.current || !workspace || !ctx.workspaces.list.getSnapshot().items.some(item => item.workspaceId === workspace.workspaceId)) return
      creating.current = true
      const request = attempt?.workspaceId === workspace.workspaceId && attempt.agentId === agentId && (attempt.profileId ?? 'host') === (profiles[agentId] ?? 'host') ? attempt : { workspaceId: workspace.workspaceId, agentId, ...(profiles[agentId] && profiles[agentId] !== 'host' ? { profileId: profiles[agentId] } : {}), operationId: crypto.randomUUID() }
      setAttempt(request); setBusy(true); setError(undefined)
      try {
        const result = record(await ctx.call('managedAgent/create', { request }))
        if (typeof result.sessionId !== 'string') throw new Error(ctx.chinese ? '创建会话失败' : 'Session creation failed')
        await ctx.sessions.refresh?.()
        if (!mounted.current || !ctx.workspaces.list.getSnapshot().items.some(item => item.workspaceId === request.workspaceId)) return
        ctx.open(result.sessionId)
        setAttempt(undefined); setExpanded(false)
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
      finally { creating.current = false; if (mounted.current) setBusy(false) }
    }
    const workspacePath = workspace?.path ?? workspace?.title ?? workspace?.workspaceId
    return React.createElement('div', { className: 'xcodexManagedAgentCreate', ref: rootRef },
      React.createElement('button', {
        className: 'xcodexManagedAgentButton', type: 'button', 'aria-expanded': expanded, 'aria-haspopup': 'menu',
        disabled: busy, title: ctx.chinese ? '选择 Agent 并新建对话' : 'Choose an Agent and create a session',
        onClick: () => setExpanded(value => !value),
      }, wide === false ? '+' : ctx.chinese ? '+ Agent 对话' : '+ Agent session'),
      expanded ? React.createElement('div', { role: 'menu', className: 'xcodexManagedAgentMenu' },
        React.createElement('div', { className: 'xcodexManagedAgentField' },
          React.createElement('span', { className: 'xcodexManagedAgentFieldLabel', id: 'xcodexManagedAgentWorkspaceLabel' }, ctx.chinese ? '工作区' : 'Workspace'),
          React.createElement('select', {
            className: 'xcodexManagedAgentSelect', 'aria-labelledby': 'xcodexManagedAgentWorkspaceLabel',
            value: workspace?.workspaceId ?? '', disabled: busy, title: workspacePath,
            onChange: (event: { target: { value: string } }) => setChosenWorkspace(event.target.value || undefined),
          },
            React.createElement('option', { value: '' }, ctx.chinese ? '请选择工作区' : 'Choose workspace'),
            ...workspaces.map(item => React.createElement('option', { key: item.workspaceId, value: item.workspaceId }, item.path ?? item.title ?? item.workspaceId)))),
        loading ? React.createElement('div', { className: 'xcodexManagedAgentStatus', role: 'status' }, spinner(React), ctx.chinese ? '正在加载 Agent…' : 'Loading Agents…') : null,
        !loading && !agents.length && !error ? React.createElement('div', { className: 'xcodexManagedAgentEmpty' }, ctx.chinese ? '没有可用 Agent，请检查插件配置后重试' : 'No Agents available. Check plugin configuration and retry.') : null,
        ...agents.filter(agent => (agent.profiles?.length ?? 0) > 1).map(agent => React.createElement('div', { className: 'xcodexManagedAgentField', key: `profile:${agent.id}` },
          React.createElement('span', { className: 'xcodexManagedAgentFieldLabel' }, `${agent.label} ${ctx.chinese ? '配置' : 'profile'}`),
          React.createElement('select', {
            className: 'xcodexManagedAgentSelect', value: profiles[agent.id] ?? 'host', disabled: busy,
            onChange: (event: Event) => setProfiles(previous => ({ ...previous, [agent.id]: (event.target as HTMLSelectElement).value })),
          },
            ...agent.profiles!.map(profile => React.createElement('option', { key: profile.id, value: profile.id }, profile.id === 'host' ? ctx.chinese ? '本机当前配置' : 'Computer configuration' : profile.label))))),
        agents.length ? React.createElement('div', { className: 'xcodexManagedAgentList' },
          ...agents.map(agent => {
            const creatingThis = busy && attempt?.agentId === agent.id
            return React.createElement('button', {
              className: 'xcodexManagedAgentItem', key: agent.id, type: 'button', role: 'menuitem',
              disabled: busy || !workspace, title: workspace ? undefined : (ctx.chinese ? '请先选择工作区' : 'Choose a workspace first'),
              onClick: () => { void create(agent.id) },
            },
              agentGlyph(React, agent.id),
              agent.label,
              creatingThis ? spinner(React) : React.createElement('span', { className: 'xcodexManagedAgentItemHint', 'aria-hidden': true }, '+'))
          })) : null,
        error ? React.createElement('div', { className: 'xcodexManagedAgentError', role: 'alert' }, error) : null,
        React.createElement('div', { className: 'xcodexManagedAgentFooter' },
          React.createElement('button', {
            className: 'xcodexManagedAgentReload', type: 'button', disabled: busy || loading,
            onClick: () => setReload(value => value + 1),
          }, refreshIcon(React), ctx.chinese ? '重新加载 Agent' : 'Reload Agents'))) : null)
  }
  return { NewSession, SessionLogo }
}