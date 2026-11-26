/**
 * Persistent Memory / Wiki — cross-session long-term memory for the Host agent.
 *
 * Borrowed from Linger (`apps/node-services/src/memory` + `src/llm-wiki`,
 * prompts under `prompts/{memory,llm-wiki}`). xagent previously kept only
 * per-session context; this module adds a durable, schema-checked memory that
 * survives across Host restarts and sessions, and a `consolidate()` maintenance
 * pass that prunes stale entries and merges duplicates (the deterministic part
 * of Linger's nightly consolidation; the LLM "judge" is pluggable).
 *
 * Storage: one JSON document per device under `<storageDir>/memory/`.
 * All I/O is atomic (write to a temp file, then rename) so a Host crash never
 * leaves a half-written memory file.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

export const MemoryKindSchema = z.enum(['user', 'project', 'context', 'preference'])
export type MemoryKind = z.infer<typeof MemoryKindSchema>

export const MemoryEntrySchema = z.object({
  id: z.string().uuid(),
  kind: MemoryKindSchema,
  text: z.string().min(1).max(8192),
  source: z.string().max(256).default('manual'),
  createdAt: z.number().int().nonnegative(),
  lastRecalled: z.number().int().nonnegative().default(0),
  recallCount: z.number().int().nonnegative().default(0),
}).strict()
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>

export const MemoryStoreSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(MemoryEntrySchema),
})
type MemoryStore = z.infer<typeof MemoryStoreSchema>

export interface RecallHit {
  entry: MemoryEntry
  score: number
}

export interface PersistentMemoryOptions {
  directory: string
  /** Optional LLM consolidation judge; absent → deterministic merge only. */
  consolidateWith?: (entries: readonly MemoryEntry[]) => Promise<{ keep: string[]; merge: Record<string, string[]> }>
}

export class PersistentMemory {
  private readonly directory: string
  private readonly storePath: string
  private records: MemoryEntry[] = []
  private loaded = false
  private readonly consolidateWith?: PersistentMemoryOptions['consolidateWith']

  constructor(options: PersistentMemoryOptions) {
    this.directory = options.directory
    this.storePath = join(options.directory, 'memory.json')
    this.consolidateWith = options.consolidateWith
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    let raw: string | undefined
    try {
      raw = await readFile(this.storePath, 'utf8')
    } catch {
      raw = undefined
    }
    if (raw !== undefined) {
      const parsed = MemoryStoreSchema.safeParse(JSON.parse(raw))
      this.records = parsed.success ? parsed.data.entries : []
    }
    this.loaded = true
  }

  private async persist(): Promise<void> {
    const document: MemoryStore = { schemaVersion: 1, entries: this.records }
    const temp = `${this.storePath}.${randomUUID()}.tmp`
    await writeFile(temp, JSON.stringify(document, null, 2), 'utf8')
    await rename(temp, this.storePath)
  }

  /** Add or update a memory. Returns the entry id. */
  async remember(input: { kind: MemoryKind; text: string; source?: string }): Promise<string> {
    await this.ensureLoaded()
    const parsed = MemoryEntrySchema.omit({ id: true, createdAt: true, lastRecalled: true, recallCount: true }).parse({
      kind: input.kind, text: input.text, source: input.source ?? 'manual',
    })
    const id = randomUUID()
    this.records.push({ ...parsed, id, createdAt: Date.now(), lastRecalled: 0, recallCount: 0 })
    await this.persist()
    return id
  }

  /** Keyword-scored recall; bumps recall stats for the top hits. */
  async recall(query: string, limit = 5): Promise<RecallHit[]> {
    await this.ensureLoaded()
    const terms = new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length > 1))
    const scored: RecallHit[] = this.records.map((entry) => {
      const haystack = entry.text.toLowerCase()
      let score = 0
      for (const term of terms) if (haystack.includes(term)) score += 1
      // Recalled entries rank higher over time.
      score += Math.min(entry.recallCount, 5) * 0.1
      return { entry, score }
    }).filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    if (scored.length > 0) {
      for (const hit of scored) {
        hit.entry.recallCount += 1
        hit.entry.lastRecalled = Date.now()
      }
      await this.persist()
    }
    return scored
  }

  /** List every stored entry (read-only). */
  async entries(): Promise<readonly MemoryEntry[]> {
    await this.ensureLoaded()
    return [...this.records]
  }

  /** Drop a single memory by id. */
  async forget(id: string): Promise<boolean> {
    await this.ensureLoaded()
    const before = this.records.length
    this.records = this.records.filter((entry) => entry.id !== id)
    if (this.records.length !== before) await this.persist()
    return this.records.length !== before
  }

  /**
   * Maintenance pass. Deterministic core: drop entries older than `pruneAfterDays`
   * that have never been recalled, and exact-text duplicates. When a
   * `consolidateWith` judge is supplied it may additionally merge related
   * entries (id → keep-id) the deterministic pass leaves alone.
   */
  async consolidate(pruneAfterDays = 30): Promise<{ pruned: number; merged: number }> {
    await this.ensureLoaded()
    const cutoff = Date.now() - pruneAfterDays * 24 * 3600 * 1000
    let pruned = 0
    const seen = new Map<string, string>()
    const kept: MemoryEntry[] = []
    for (const entry of this.records) {
      if (entry.lastRecalled === 0 && entry.createdAt < cutoff) {
        pruned += 1
        continue
      }
      const key = entry.text.trim().toLowerCase()
      const dup = seen.get(key)
      if (dup !== undefined) {
        pruned += 1
        continue
      }
      seen.set(key, entry.id)
      kept.push(entry)
    }
    let merged = 0
    if (this.consolidateWith) {
      try {
        const verdict = await this.consolidateWith(kept)
        const drop = new Set<string>()
        // merge maps keep-id → ids to fold into it.
        for (const [targetId, sourceIds] of Object.entries(verdict.merge)) {
          if (kept.some((e) => e.id === targetId)) {
            for (const sourceId of sourceIds) drop.add(sourceId)
          }
        }
        for (const entry of kept) if (drop.has(entry.id)) merged += 1
        this.records = kept.filter((entry) => !drop.has(entry.id))
      } catch {
        this.records = kept
      }
    } else {
      this.records = kept
    }
    await this.persist()
    return { pruned, merged }
  }
}

export async function openPersistentMemory(directory: string, options?: Omit<PersistentMemoryOptions, 'directory'>): Promise<PersistentMemory> {
  await mkdir(directory, { recursive: true })
  return new PersistentMemory({ directory, ...options })
}
