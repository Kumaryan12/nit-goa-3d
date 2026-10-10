/** Bounded reconnects, with a grace period for short mobile-network interruptions. */
export class OatVoiceRecovery {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private attempts = new Map<string, number>()
  private retry: (id: string) => void
  private exhausted: () => void
  private delays: number[]
  private grace: number
  constructor(retry: (id: string) => void, exhausted: () => void,
    delays = [1000, 3000, 8000], grace = 5000) {
    this.retry = retry; this.exhausted = exhausted; this.delays = delays; this.grace = grace
  }
  schedule(id: string, disconnected = false) {
    if (this.timers.has(id)) return
    const attempt = this.attempts.get(id) ?? 0
    if (attempt >= this.delays.length) { this.exhausted(); return }
    const timer = setTimeout(() => {
      this.timers.delete(id); this.attempts.set(id, attempt + 1); this.retry(id)
    }, disconnected ? this.grace : this.delays[attempt])
    this.timers.set(id, timer)
  }
  connected(id: string) { this.remove(id); this.attempts.delete(id) }
  remove(id: string) {
    const timer = this.timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    this.timers.delete(id)
  }
  reset() { for (const id of this.timers.keys()) this.remove(id); this.attempts.clear() }
}
