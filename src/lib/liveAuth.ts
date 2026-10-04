import { getFirebaseAuth } from './firebase'
// Firebase tokens travel in WebSocket frames, never URLs, referrers or logs.
export function authenticateLiveSocket(socket: WebSocket) {
  let active = true,
    unsubscribe: (() => void) | undefined
  void Promise.all([getFirebaseAuth(), import('firebase/auth')])
    .then(([auth, sdk]) => {
      if (!active) return
      unsubscribe = sdk.onIdTokenChanged(auth, async (user) => {
        if (!active) return
        if (!user) {
          socket.close(4401, 'Sign-in required')
          return
        }
        try {
          const token = await user.getIdToken()
          if (active && socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: 'authenticate', token }))
        } catch {
          socket.close(4401, 'Sign-in required')
        }
      })
    })
    .catch(() => socket.close(4401, 'Sign-in required'))
  return () => {
    active = false
    unsubscribe?.()
  }
}
