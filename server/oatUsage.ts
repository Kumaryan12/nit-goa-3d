import type { Firestore } from 'firebase-admin/firestore'
import type { OatUsageStatus } from '../src/lib/oatUsage.ts'

export const OAT_USAGE_POLL_MS = 60000
const FRESH_MS = 90000
const GB = 1000000000
export const OAT_VOICE_CUTOFF = 900 * GB
export const OAT_VOICE_WARNINGS = [700 * GB, 850 * GB]
export interface UsageCycle { start: string; end: string }
export interface UsageCheckpoint { usedBytes: number; blocked: boolean; warningLevel: number }
export type UsageStore = (cycle: UsageCycle, bytes: number) => Promise<UsageCheckpoint>
export type UsageReader = (cycle: UsageCycle) => Promise<number>

// An explicit provider billing anchor avoids treating a rolling 30-day chart as
// the billing period. Clamp short months without losing the original day.
export function oatUsageCycle(anchor: string, now: number): UsageCycle {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error('Invalid usage period')
  const initial = Date.parse(anchor + 'T00:00:00Z')
  if (!Number.isFinite(initial) || new Date(initial).toISOString().slice(0, 10) !== anchor || now < initial) throw new Error('Invalid usage period')
  const date = new Date(now), day = new Date(initial).getUTCDate()
  const boundary = (year: number, month: number) => Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()))
  let month = date.getUTCMonth(), year = date.getUTCFullYear()
  if (now < boundary(year, month)) month--
  return { start: new Date(boundary(year, month)).toISOString(), end: new Date(boundary(year, month + 1)).toISOString() }
}

export function createCloudflareUsageReader(
  env: Record<string, string | undefined>, request: typeof fetch = fetch,
): UsageReader {
  const account = env.OAT_CLOUDFLARE_ACCOUNT_ID, token = env.OAT_CLOUDFLARE_ANALYTICS_TOKEN
  return async cycle => {
    if (!account || !/^[a-f0-9]{32}$/.test(account) || !token) throw new Error('Usage monitoring is not configured')
    // Aggregate the whole account, not just our key: other TURN keys can share
    // the free allowance. No dimensions means one aggregate, not truncated rows.
    const query = `query OatUsage($account: String!, $from: Date!, $to: Date!) {
      viewer { accounts(filter: {accountTag: $account}) {
        callsTurnUsageAdaptiveGroups(limit: 1, filter: {date_geq: $from, date_leq: $to}) { sum { egressBytes } }
      } }
    }`
    const response = await request('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { account, from: cycle.start.slice(0, 10), to: new Date(Date.parse(cycle.end) - 1).toISOString().slice(0, 10) } }),
      signal: AbortSignal.timeout(10000), redirect: 'error',
    })
    if (!response.ok) throw new Error('Usage monitoring is unavailable')
    const text = await response.text()
    if (text.length > 65536) throw new Error('Invalid usage response')
    const body = JSON.parse(text), accounts = body.data?.viewer?.accounts
    if ((body.errors && (!Array.isArray(body.errors) || body.errors.length)) || !Array.isArray(accounts) || accounts.length !== 1) throw new Error('Invalid usage response')
    const groups = accounts[0]?.callsTurnUsageAdaptiveGroups
    if (!Array.isArray(groups) || groups.length > 1) throw new Error('Invalid usage response')
    const bytes = groups.length ? groups[0]?.sum?.egressBytes : 0
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid usage response')
    return bytes
  }
}

export function createFirestoreUsageStore(db: () => Firestore, account: string): UsageStore {
  return (cycle, bytes) => {
    if (!/^[a-f0-9]{32}$/.test(account)) throw new Error('Invalid usage account')
    const database = db(), ref = database.doc(`oatUsage/${account}-${cycle.start.slice(0, 10)}`)
    return database.runTransaction(async tx => {
      const previous = (await tx.get(ref)).data()
      if (previous && (!Number.isSafeInteger(previous.usedBytes) || previous.usedBytes < 0 || typeof previous.blocked !== 'boolean')) throw new Error('Invalid usage checkpoint')
      const usedBytes = Math.max(bytes, previous?.usedBytes ?? 0)
      const checkpoint = { usedBytes, blocked: previous?.blocked === true || usedBytes >= OAT_VOICE_CUTOFF, warningLevel: OAT_VOICE_WARNINGS.filter(limit => usedBytes >= limit).length }
      tx.set(ref, { ...checkpoint, cycleStart: cycle.start, cycleEnd: cycle.end })
      return checkpoint
    })
  }
}

export function createOatUsageMonitor(anchor: string, read: UsageReader, store: UsageStore, now: () => number = Date.now) {
  let cycle: UsageCycle | null = null, checkedAt: number | null = null, checkpoint: UsageCheckpoint | null = null
  let unavailable = false, closed = false, pending: Promise<void> | undefined, attemptedAt = -Infinity, attemptedCycle = ''
  const listeners = new Set<() => void>()
  const snapshot = (): OatUsageStatus => {
    let current: UsageCycle | null = null
    try { current = oatUsageCycle(anchor, now()) } catch { /* Fail closed for invalid/missing billing configuration. */ }
    const sameCycle = !!current && current.start === cycle?.start
    const fresh = sameCycle && checkedAt !== null && now() - checkedAt >= 0 && now() - checkedAt < FRESH_MS
    const availability = sameCycle && checkpoint?.blocked ? 'quota' : unavailable || !current ? 'unavailable' : !fresh || closed ? 'checking' : 'available'
    return { provider: 'cloudflare', availability, usedBytes: sameCycle ? checkpoint?.usedBytes ?? null : null, allowanceBytes: 1000 * GB, cutoffBytes: OAT_VOICE_CUTOFF, warningBytes: [...OAT_VOICE_WARNINGS], cycleStart: current?.start ?? null, cycleEnd: current?.end ?? null, checkedAt: sameCycle ? checkedAt : null, warningLevel: sameCycle ? checkpoint?.warningLevel ?? 0 : 0 }
  }
  const changed = () => { for (const listener of listeners) listener() }
  const refresh = (force = false): Promise<void> => {
    if (closed) return Promise.resolve()
    if (pending) return pending
    let period = ''
    try { period = oatUsageCycle(anchor, now()).start } catch { /* Handled below. */ }
    if (!force && period === attemptedCycle && now() - attemptedAt < OAT_USAGE_POLL_MS) return Promise.resolve()
    attemptedAt = now(); attemptedCycle = period
    pending = (async () => {
      try {
        const current = oatUsageCycle(anchor, now()), bytes = await read(current)
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid usage')
        const saved = await store(current, bytes)
        if (!Number.isSafeInteger(saved.usedBytes) || saved.usedBytes < bytes || typeof saved.blocked !== 'boolean' || !Number.isInteger(saved.warningLevel) || saved.warningLevel < 0 || saved.warningLevel > 2) throw new Error('Invalid usage checkpoint')
        // A fetch crossing the period boundary must never open the new cycle.
        if (current.start !== oatUsageCycle(anchor, now()).start) throw new Error('Usage period changed')
        const previousLevel = current.start === cycle?.start ? checkpoint?.warningLevel ?? 0 : 0
        const wasBlocked = current.start === cycle?.start && checkpoint?.blocked
        cycle = current; checkpoint = { ...saved, blocked: saved.blocked || saved.usedBytes >= OAT_VOICE_CUTOFF }; checkedAt = now(); unavailable = false
        if (saved.warningLevel > previousLevel || (checkpoint.blocked && !wasBlocked)) console.info(JSON.stringify({ event: 'oat-voice-usage', cycleStart: current.start, usedGB: saved.usedBytes / GB, warningLevel: saved.warningLevel, paused: checkpoint.blocked }))
      } catch { unavailable = true } // Never log provider responses/tokens.
      if (!closed) changed()
    })().finally(() => { pending = undefined })
    return pending
  }
  return {
    snapshot, refresh,
    allowed: () => snapshot().availability === 'available',
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    close() { closed = true; listeners.clear() },
  }
}
export type OatUsageMonitor = ReturnType<typeof createOatUsageMonitor>
