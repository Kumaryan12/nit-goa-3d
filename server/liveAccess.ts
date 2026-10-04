import type { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import { createAccessVerifier } from './access.ts'
import type { CampusIdentity, VerifyAccess } from './access.ts'
interface Entry {
  ws: WebSocket
  identity: CampusIdentity
  token: string
  admitted: boolean
  checking: boolean
  expiry?: ReturnType<typeof setTimeout>
}
export function attachLiveAccess(
  server: EventEmitter,
  wss: WebSocketServer,
  path: string,
  origin: string | undefined,
  capacity: number,
  verify: VerifyAccess = createAccessVerifier(),
) {
  const alive = new WeakSet<WebSocket>()
  const entries = new Map<string, Entry>(),
    pending = new Set<WebSocket>(),
    attempts = new Map<string, { count: number; until: number }>(),
    cooldown = new Map<string, number>()
  let admitted: (ws: WebSocket, identity: CampusIdentity) => void = () => {},
    closed = false
  const send = (ws: WebSocket, value: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value))
  }
  const drain = () => {
    if (closed) return
    let count = [...entries.values()].filter((e) => e.admitted).length
    for (const entry of entries.values())
      if (!entry.admitted && entry.identity.expiresAt <= Date.now())
        entry.ws.close(4401, 'Session expired')
    for (const entry of entries.values())
      if (
        !entry.admitted &&
        count < capacity &&
        entry.ws.readyState === WebSocket.OPEN
      ) {
        entry.admitted = true
        count++
        admitted(entry.ws, entry.identity)
      }
    let position = 0
    for (const entry of entries.values())
      if (!entry.admitted)
        send(entry.ws, {
          type: 'waiting',
          position: ++position,
          capacity,
          occupancy: count,
        })
  }
  const reject = (ws: WebSocket, message: string) => {
    send(ws, { type: 'error', message })
    ws.close(4403, 'Access denied')
  }
  const expire = (entry: Entry) => {
    clearTimeout(entry.expiry)
    entry.expiry = setTimeout(
      () => reject(entry.ws, 'Your session expired. Sign in again.'),
      Math.max(1, Math.min(2147483647, entry.identity.expiresAt - Date.now())),
    )
    entry.expiry.unref()
  }
  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    if (request.url?.split('?')[0] !== path) return
    const allowed = origin
      ? [origin]
      : [`http://${request.headers.host}`, `https://${request.headers.host}`]
    const ip = request.socket.remoteAddress || 'unknown',
      now = Date.now()
    for (const [key, value] of attempts)
      if (value.until < now) attempts.delete(key)
    if (!attempts.has(ip) && attempts.size >= 4096) {
      socket.destroy()
      return
    }
    const attempt = attempts.get(ip) || { count: 0, until: now + 60000 }
    attempt.count++
    attempts.set(ip, attempt)
    if (
      !request.headers.origin ||
      !allowed.includes(request.headers.origin) ||
      attempt.count > 120 ||
      attempts.size > 4096 ||
      pending.size >= 32 ||
      wss.clients.size >= capacity + 100
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws))
  }
  server.on('upgrade', onUpgrade)
  wss.on('connection', (ws) => {
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))
    pending.add(ws)
    ws.on('error', () => undefined)
    let entry: Entry | undefined,
      authBusy = false,
      authenticatedAt = 0,
      messages = 0,
      windowAt = Date.now()
    const deadline = setTimeout(() => {
      if (!entry) ws.close(4401, 'Sign-in required')
    }, 15000)
    deadline.unref()
    send(ws, { type: 'auth-required' })
    ws.on('message', async (bytes, binary) => {
      if (entry && entry.identity.expiresAt <= Date.now()) {
        reject(ws, 'Your session expired.')
        return
      }
      if (Date.now() - windowAt > 1000) {
        messages = 0
        windowAt = Date.now()
      }
      if (++messages > (path === '/oat' ? 300 : 60) || binary) {
        ws.close(4408, 'Message limit')
        return
      }
      let msg
      try {
        msg = JSON.parse(bytes.toString())
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      if (msg.type !== 'authenticate') {
        if (!entry) reject(ws, 'Sign in before joining.')
        return
      }
      if (authBusy || (entry && entry.checking)) return
      if (entry && Date.now() - authenticatedAt < 5000) return
      authBusy = true
      authenticatedAt = Date.now()
      try {
        const identity = await verify(msg.token)
        if (ws.readyState !== WebSocket.OPEN || closed) return
        if (entry) {
          if (identity.id !== entry.identity.id) {
            reject(ws, 'Account changed. Rejoin the room.')
            return
          }
          entry.identity = identity
          entry.token = msg.token
          expire(entry)
        } else {
          if (entries.has(identity.id)) {
            reject(ws, 'You already joined this room in another tab.')
            return
          }
          if ((cooldown.get(identity.id) || 0) > Date.now()) {
            reject(ws, 'Please wait before rejoining this room.')
            return
          }
          entry = {
            ws,
            identity,
            token: msg.token,
            admitted: false,
            checking: false,
          }
          entries.set(identity.id, entry)
          expire(entry)
          pending.delete(ws)
          clearTimeout(deadline)
          drain()
        }
      } catch (error) {
        reject(
          ws,
          error instanceof Error
            ? error.message
            : 'Sign-in verification failed.',
        )
      } finally {
        authBusy = false
      }
    })
    ws.on('close', () => {
      clearTimeout(entry?.expiry)
      clearTimeout(deadline)
      pending.delete(ws)
      if (entry && entries.get(entry.identity.id) === entry)
        entries.delete(entry.identity.id)
      queueMicrotask(drain)
    })
  })
  const refresh = setInterval(() => {
    for (const [id, until] of cooldown)
      if (until < Date.now()) cooldown.delete(id)
    for (const entry of entries.values()) {
      if (entry.identity.expiresAt <= Date.now()) {
        reject(entry.ws, 'Your session expired. Rejoin after signing in.')
        continue
      }
      if (entry.checking) continue
      entry.checking = true
      void verify(entry.token)
        .then((identity) => {
          entry.identity = identity
        })
        .catch(() => reject(entry.ws, 'Your campus access ended.'))
        .finally(() => {
          entry.checking = false
        })
    }
    for (const ws of wss.clients) {
      if (!alive.has(ws) || ws.bufferedAmount > 131072) ws.terminate()
      else {
        alive.delete(ws)
        ws.ping()
      }
    }
  }, 30000)
  refresh.unref()
  return {
    onAdmit(callback: typeof admitted) {
      admitted = callback
    },
    isAdmitted(ws: WebSocket) {
      return [...entries.values()].some((e) => e.ws === ws && e.admitted && e.identity.expiresAt > Date.now() && e.ws.readyState === WebSocket.OPEN)
    },
    identity(ws: WebSocket) {
      return [...entries.values()].find(e => e.ws === ws && e.admitted && e.identity.expiresAt > Date.now() && e.ws.readyState === WebSocket.OPEN)?.identity ?? null
    },
    snapshot() {
      return {
        capacity,
        occupancy: [...entries.values()].filter((e) => e.admitted).length,
        waiting: [...entries.values()].filter((e) => !e.admitted).length,
        people: [...entries.values()].map((e) => ({
          id: e.identity.id,
          name: e.identity.name,
          role: e.identity.role,
          waiting: !e.admitted,
        })),
      }
    },
    kick(id: string) {
      const e = entries.get(id)
      if (e) {
        cooldown.set(id, Date.now() + 60000)
        reject(e.ws, 'A moderator ended your room session.')
      }
    },
    close() {
      if (closed) return
      closed = true
      clearInterval(refresh)
      server.off('upgrade', onUpgrade)
      for (const ws of wss.clients) ws.terminate()
      entries.clear()
      pending.clear()
      wss.close()
    },
  }
}
