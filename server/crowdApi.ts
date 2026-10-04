import type { IncomingMessage, ServerResponse } from 'node:http'
import { bearer, createAccessVerifier } from './access.ts'
import type { VerifyAccess } from './access.ts'
import type { attachLiveAccess } from './liveAccess.ts'
import { firebaseAdmin } from './firebaseAdmin.ts'
import { createModeratorService, createModerationStore } from './moderation.ts'
import { readJSON, sendJSON } from './httpUtils.ts'
type Access = ReturnType<typeof attachLiveAccess>
export function createCrowdAPI(
  football: Access,
  oat: Access,
  endStage: (id: string) => void,
  verify: VerifyAccess = createAccessVerifier(),
  changed = () => {},
  provider = () => {
    const { db } = firebaseAdmin()
    return {
      factors: createModeratorService(db),
      moderate: createModerationStore(db),
    }
  },
) {
  let busy = 0,
    services: ReturnType<typeof provider> | null = null
  return (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url?.split('?')[0]
    if (path !== '/api/crowd' && path !== '/api/moderator/verification')
      return false
    if (!['GET', 'POST'].includes(req.method || '')) {
      sendJSON(res, 405, { error: 'Method not supported.' })
      req.resume()
      return true
    }
    if (busy >= 8) {
      sendJSON(res, 429, { error: 'Please wait a moment.' })
      req.resume()
      return true
    }
    busy++
    void (async () => {
      const token = bearer(req)
      if (!token) {
        sendJSON(res, 401, { error: 'Sign in to continue.' })
        req.resume()
        return
      }
      const identity = await verify(token)
      if (identity.role !== 'admin') {
        sendJSON(res, 403, { error: 'Admin access required.' })
        req.resume()
        return
      }
      if (path === '/api/crowd' && req.method === 'GET') {
        sendJSON(res, 200, {
          football: football.snapshot(),
          oat: oat.snapshot(),
        })
        return
      }
      services ??= provider()
      if (path === '/api/moderator/verification') {
        if (req.method === 'GET') {
          sendJSON(res, 200, {
            enrolled: await services.factors.enrolled(identity),
          })
          return
        }
        const body = await readJSON(req, 2048)
        if (body?.action === 'enroll')
          sendJSON(res, 200, await services.factors.enroll(identity))
        else if (body?.action === 'verify')
          sendJSON(res, 200, await services.factors.verify(identity, body.code))
        else sendJSON(res, 400, { error: 'Choose a verification action.' })
        return
      }
      services.factors.authorize(identity, req.headers['x-moderator-token'])
      const body = await readJSON(req, 2048)
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new Error('Choose a valid account, action and reason.')
      await services.moderate(identity, body)
      if (body.action === 'kick' || body.action === 'ban') {
        football.kick(body.target)
        oat.kick(body.target)
      }
      if (body.action === 'end-stage') endStage(body.target)
      changed()
      sendJSON(res, 200, { ok: true })
    })()
      .catch((error) => {
        const message = error instanceof Error ? error.message : ''
        const allowed =
          /^(Admin access required|Moderator access required|Confirm your Google|An authenticator|Too many attempts|Wait a minute|Start authenticator|Enter the six-digit|That code|Verify your authenticator|Your moderator verification|Choose a valid|You cannot moderate|This action is outside|Moderator verification is not configured)/.test(
            message,
          )
        sendJSON(res, 403, {
          error: allowed
            ? message
            : 'The request could not be authorized or completed.',
        })
        req.resume()
      })
      .finally(() => busy--)
    return true
  }
}
