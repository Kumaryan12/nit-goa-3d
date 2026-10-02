export function shouldRetry(status: number): boolean { return status === 429 || status >= 500 && status <= 599 }
export function retryDelay(attempt: number, random = Math.random(), retryAfter?: string | null): number {
  const requested = retryAfter ? Number(retryAfter) * 1000 : 0
  return Math.min(5000, Math.max(Number.isFinite(requested) ? requested : 0, 700 * 2 ** attempt + Math.max(0, Math.min(1, random)) * 350))
}
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return }
    const cleanup = () => signal?.removeEventListener('abort', cancel)
    const timer = setTimeout(() => { cleanup(); resolve() }, ms)
    const cancel = () => { clearTimeout(timer); cleanup(); reject(signal?.reason) }
    signal?.addEventListener('abort', cancel, { once: true })
  })
}
export async function fetchWithRetry(url: string, init: RequestInit, options: { retries?: number; timeoutMs?: number; sleep?: typeof abortableDelay; fetcher?: typeof fetch } = {}): Promise<Response> {
  const retries = Math.max(0, Math.min(3, options.retries ?? 2)), parent = init.signal ?? undefined
  for (let attempt = 0; ; attempt++) {
    parent?.throwIfAborted()
    const controller = new AbortController(), cancel = () => controller.abort(parent?.reason)
    parent?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(() => controller.abort(new Error('Map request timed out.')), options.timeoutMs ?? 15000)
    let delay = retryDelay(attempt)
    try {
      const response = await (options.fetcher ?? fetch)(url, { ...init, signal: controller.signal })
      if (!shouldRetry(response.status) || attempt >= retries) return response
      delay = retryDelay(attempt, Math.random(), response.headers.get('Retry-After'))
      await response.body?.cancel()
    } catch (error) { if (parent?.aborted || attempt >= retries) throw error }
    finally { clearTimeout(timer); parent?.removeEventListener('abort', cancel) }
    await (options.sleep ?? abortableDelay)(delay, parent)
  }
}
