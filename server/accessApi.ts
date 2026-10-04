import type { IncomingMessage, ServerResponse } from 'node:http'
import { bearer, createAccessVerifier } from './access.ts'
import type { VerifyAccess } from './access.ts'
export function createAccessAPI(verify: VerifyAccess = createAccessVerifier()) {
  let busy = 0
  return (req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.split('?')[0] !== '/api/access') return false
    const send = (status: number, value: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify(value))
    }
    if (req.method !== 'GET') {
      send(405, { error: 'Method not supported.' })
      req.resume()
      return true
    }
    if (busy >= 16) {
      send(429, { error: 'Campus is busy. Try again in a moment.' })
      return true
    }
    const token = bearer(req)
    if (!token) {
      send(401, { error: 'Sign in to join campus.' })
      return true
    }
    busy++
    void verify(token)
      .then((identity) =>
        send(200, {
          id: identity.id,
          name: identity.name,
          role: identity.role,
          status: 'active',
        }),
      )
      .catch((error) =>
        send(403, {
          error:
            error instanceof Error && /^(Use a verified|This Google account|Campus access|Your Google sign-in|Sign in to)/.test(error.message)
              ? error.message
              : 'Campus access could not be verified.',
        }),
      )
      .finally(() => busy--)
    return true
  }
}
