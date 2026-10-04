import type { IncomingMessage, ServerResponse } from 'node:http'
import { firebaseAdmin, firebaseProject } from './firebaseAdmin.ts'
import { bearer, createAccessVerifier } from './access.ts'
import type { VerifyAccess } from './access.ts'
import { createProfileStore } from './profileStore.ts'
import { readJSON, sendJSON } from './httpUtils.ts'
export function createProfileAPI(
  verify: VerifyAccess = createAccessVerifier(),
  provider = () => createProfileStore(firebaseAdmin().db),
) {
  let store: ReturnType<typeof createProfileStore> | null = null,
    busy = 0
  const windows = new Map<string, { count: number; until: number }>()
  return {
    handle(req: IncomingMessage, res: ServerResponse) {
      const url = new URL(req.url || '/', 'http://campus.local'),
        path = url.pathname
      if (
        path !== '/api/me' &&
        path !== '/api/people' &&
        !path.startsWith('/api/people/')
      )
        return false
      if (!firebaseProject()) {
        sendJSON(res, 503, { error: 'Firebase is not connected yet.' })
        req.resume()
        return true
      }
      const key = req.socket.remoteAddress || 'unknown',
        now = Date.now()
      for (const [ip, value] of windows)
        if (value.until < now) windows.delete(ip)
      if (!windows.has(key) && windows.size >= 4096) {
        sendJSON(res, 429, { error: 'Please wait a moment.' })
        return true
      }
      const window = windows.get(key) || { count: 0, until: now + 60000 }
      window.count++
      windows.set(key, window)
      if (busy >= 12 || window.count > 240) {
        sendJSON(res, 429, { error: 'Campus is busy. Try again in a moment.' })
        req.resume()
        return true
      }
      busy++
      void (async () => {
        store ??= provider()
        if (path === '/api/me') {
          if (!['GET', 'PATCH'].includes(req.method || '')) {
            sendJSON(res, 405, { error: 'Method not supported.' })
            req.resume()
            return
          }
          const identity = await verify(bearer(req))
          sendJSON(
            res,
            200,
            req.method === 'GET'
              ? await store.own(identity.id)
              : await store.save(identity, await readJSON(req)),
          )
          return
        }
        if (req.method !== 'GET') {
          sendJSON(res, 405, { error: 'Method not supported.' })
          req.resume()
          return
        }
        sendJSON(
          res,
          200,
          path === '/api/people'
            ? await store.directory(url.searchParams.get('cursor') || undefined)
            : await store.publicProfile(path.slice(12)),
        )
      })()
        .catch((error) => {
          const message = error instanceof Error ? error.message : ''
          const input =
            /^(Invalid profile|Choose a display|Use 3|Choose a handle|Your bio|Add up to|Choose an available|That handle|Invalid directory|Use a JSON|Request too large|Invalid JSON)/.test(
              message,
            )
          const auth =
            /^(Use a verified|This Google account|Campus access|Your Google sign-in|Sign in to)/.test(
              message,
            )
          sendJSON(res, input ? 400 : auth ? 403 : 503, {
            error:
              input || auth ? message : 'Profiles are temporarily unavailable.',
          })
          req.resume()
        })
        .finally(() => busy--)
      return true
    },
    changed() {
      store?.changed()
    },
  }
}
