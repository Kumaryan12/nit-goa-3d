export class CampusRequestError extends Error {
  status: number
  retryable: boolean
  constructor(message: string, status = 0, retryable = false) {
    super(message)
    this.name = 'CampusRequestError'
    this.status = status
    this.retryable = retryable
  }
}

// Include SDK/token acquisition and response parsing, not just fetch headers.
// Racing the task also bounds providers that do not observe AbortSignal.
export async function withRequestDeadline<T>(task: (signal: AbortSignal) => Promise<T>, milliseconds: number, parent?: AbortSignal | null): Promise<T> {
  const controller = new AbortController()
  const cancel = () => controller.abort(parent?.reason ?? new DOMException('Cancelled', 'AbortError'))
  if (parent?.aborted) cancel()
  else parent?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('The campus connection timed out.', 'TimeoutError')), milliseconds)
  let onAbort: () => void = () => {}
  try {
    controller.signal.throwIfAborted()
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    return await Promise.race([task(controller.signal), aborted])
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', cancel)
    controller.signal.removeEventListener('abort', onAbort)
  }
}

export async function requestCampusJSON(url: URL, options: RequestInit, token: (() => Promise<string>) | null, fetcher: typeof fetch = fetch) {
  return withRequestDeadline(async signal => {
    const headers = new Headers(options.headers)
    if (token) headers.set('Authorization', `Bearer ${await token()}`)
    signal.throwIfAborted()
    const response = await fetcher(url, { ...options, headers, signal })
    const retryable = [408, 429, 500, 502, 503, 504].includes(response.status)
    let data
    try { data = await response.json() }
    catch {
      // A sleeping/suspended host may return HTML rather than our JSON API.
      throw new CampusRequestError('The campus server is not ready. Please try again.', response.status, retryable || response.ok)
    }
    if (!response.ok) throw new CampusRequestError(
      typeof data?.error === 'string' ? data.error.slice(0, 240) : 'The campus request could not be completed.',
      response.status, retryable,
    )
    return data
  }, 15000, options.signal)
}

export interface CampusAccess {
  id: string
  name: string
  role: 'member' | 'moderator' | 'admin'
  status: 'active'
  avatarStyle?: 'girl' | 'boy' | null
}

export const retryableAccountError = (error: unknown) => error instanceof CampusRequestError ? error.retryable
  : error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')

function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const cancel = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, milliseconds)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

// Only the read-only admission check retries; profile writes and moderation do not.
export async function loadCampusAccess(
  uid: string,
  request: (signal: AbortSignal) => Promise<unknown>,
  parent: AbortSignal,
  onRetry: () => void,
  timing = { total: 60000, attempt: 12000, delays: [1000, 2000, 4000] },
): Promise<CampusAccess> {
  return withRequestDeadline(async signal => {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      try {
        const data = await withRequestDeadline(request, timing.attempt, signal) as Partial<CampusAccess> | null
        if (!data || data.id !== uid || data.status !== 'active' || typeof data.name !== 'string' || !['member', 'moderator', 'admin'].includes(data.role || ''))
          throw new CampusRequestError('Your campus account could not be verified. Please sign in again.')
        if (data.avatarStyle != null && data.avatarStyle !== 'boy' && data.avatarStyle !== 'girl')
          throw new CampusRequestError('Your campus account could not be verified. Please try again.')
        return data as CampusAccess
      } catch (error) {
        signal.throwIfAborted()
        if (!retryableAccountError(error) || attempt >= timing.delays.length) throw error
        onRetry()
        await pause(timing.delays[attempt], signal)
      }
    }
  }, timing.total, parent)
}
