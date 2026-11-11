// The Firebase observer stays subscribed after the watchdog fires: a late valid
// result recovers automatically. Disposal prevents stale user/account callbacks.
export function observeAuthStartup<T>(
  subscribe: (next: (user: T) => void, failed: () => void) => () => void,
  next: (user: T) => void,
  failed: () => void,
  timeoutMs = 12000,
) {
  let active = true
  const timer = setTimeout(() => { if (active) failed() }, timeoutMs)
  let unsubscribe: (() => void) | undefined
  try {
    unsubscribe = subscribe(user => {
      clearTimeout(timer)
      if (active) next(user)
    }, () => {
      clearTimeout(timer)
      if (active) failed()
    })
  } catch { clearTimeout(timer); failed() }
  return () => { active = false; clearTimeout(timer); unsubscribe?.() }
}
