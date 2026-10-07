export const LIVE_STALE_MS = 10000
export const LIVE_RESUME_GRACE_MS = 1500
export function liveConnectionStalled(now: number, receivedAt: number, foregroundAt: number, visible: boolean, initialized: boolean): boolean {
  return visible && initialized && now - receivedAt > LIVE_STALE_MS && now - foregroundAt > LIVE_RESUME_GRACE_MS
}

// Mobile browsers suspend timers and sockets in the background. Publishing on
// return is insufficient if the browser still reports a dead socket as OPEN.
export function watchLiveConnection(socket: WebSocket) {
  let receivedAt = performance.now(), foregroundAt = receivedAt, initialized = false
  const received = (live = true) => { receivedAt = performance.now(); initialized ||= live }
  const foreground = () => { if (!document.hidden) foregroundAt = performance.now() }
  const timer = window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN && liveConnectionStalled(performance.now(), receivedAt, foregroundAt, !document.hidden, initialized)) socket.close(4000, 'Live updates stalled')
  }, 1000)
  document.addEventListener('visibilitychange', foreground)
  window.addEventListener('pageshow', foreground); window.addEventListener('online', foreground)
  return { received, stop: () => { clearInterval(timer); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('pageshow', foreground); window.removeEventListener('online', foreground) } }
}
