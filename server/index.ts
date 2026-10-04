import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { attachFootballServer } from './footballServer.ts'
import { attachOatServer } from './oatServer.ts'
import { createAccessVerifier } from './access.ts'
import { firebaseProject, firebaseAdmin } from './firebaseAdmin.ts'
import { createProfileAPI } from './profileApi.ts'
import { createAccessAPI } from './accessApi.ts'
import { createReadiness } from './readiness.ts'
import { createCrowdAPI } from './crowdApi.ts'
const project = firebaseProject(),
  production = process.env.NODE_ENV === 'production'
const site = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL
if (production && (!project || !site || !/^https:\/\/[^/]+\/?$/.test(site)))
  throw new Error(
    'Production requires Firebase configuration and an HTTPS SITE_URL. See DEPLOYMENT.md.',
  )
if (site && (new URL(site).username || new URL(site).password))
  throw new Error('SITE_URL must not contain credentials.')
const ready = createReadiness()
const origin = site ? new URL(site).origin : undefined,
  verify = createAccessVerifier()
let oat: ReturnType<typeof attachOatServer>,
  crowd: ReturnType<typeof createCrowdAPI>
const root = resolve('dist'),
  types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2',
  }
const accessAPI = createAccessAPI(verify),
  profiles = createProfileAPI(verify)
const customMapOrigin = (() => {
  try {
    const url = new URL(
      process.env.VITE_OVERPASS_ENDPOINT || 'https://overpass-api.de',
    )
    return url.protocol === 'https:' ? url.origin : ''
  } catch {
    return ''
  }
})()
const authDomain =
  process.env.VITE_FIREBASE_AUTH_DOMAIN || `${project}.firebaseapp.com`
if (!/^[a-z0-9.-]+$/.test(authDomain))
  throw new Error('Invalid Firebase auth domain.')
if (production) firebaseAdmin()
const csp = `default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://${authDomain} https://overpass-api.de https://overpass.kumi.systems ${customMapOrigin}; media-src 'self' blob: https:; frame-src https://${authDomain} https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
const server = createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Content-Security-Policy', csp)
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(self)',
  )
  if (production)
    response.setHeader('Strict-Transport-Security', 'max-age=31536000')
  if (request.url === '/healthz' || request.url === '/readyz') {
    void (request.url === '/healthz' ? Promise.resolve(true) : ready()).then(
      (ok) => {
        response.writeHead(ok ? 200 : 503, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        })
        response.end(JSON.stringify({ ok }))
      },
    )
    return
  }
  if (
    accessAPI(request, response) ||
    profiles.handle(request, response) ||
    crowd?.(request, response) ||
    oat?.handleRequest(request, response)
  )
    return
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405)
    response.end()
    return
  }
  let path: string
  try {
    path = decodeURIComponent(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    )
  } catch {
    response.writeHead(400)
    response.end()
    return
  }
  if (path === '/football' || path === '/oat') {
    response.writeHead(426)
    response.end('WebSocket required')
    return
  }
  if (
    path.split('/').some((part) => part.startsWith('.') || part.includes('\\'))
  ) {
    response.writeHead(404)
    response.end()
    return
  }
  const spa =
    path === '/' ||
    ['/campus', '/me', '/manage', '/people'].includes(path) ||
    /^\/people\/[a-z][a-z0-9_]{2,23}$/.test(path)
  const file = resolve(root, spa ? 'index.html' : '.' + path)
  if (!file.startsWith(root + sep)) {
    response.writeHead(403)
    response.end()
    return
  }
  try {
    if (!statSync(file).isFile()) throw new Error('not a file')
    response.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': path.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    })
    if (request.method === 'HEAD') response.end()
    else
      createReadStream(file)
        .on('error', () => response.destroy())
        .pipe(response)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
})
server.requestTimeout = 15000
server.headersTimeout = 10000
server.maxHeadersCount = 50
const football = attachFootballServer(
  server,
  origin ?? process.env.FOOTBALL_ORIGIN,
  verify,
)
oat = attachOatServer(
  server,
  origin ?? process.env.OAT_ORIGIN ?? process.env.FOOTBALL_ORIGIN,
  verify,
)
crowd = createCrowdAPI(football.access, oat.access, oat.endStage, verify, () =>
  profiles.changed(),
)
server.on('upgrade', (request, socket) => {
  if (!['/football', '/oat'].includes(request.url?.split('?')[0] || ''))
    socket.destroy()
})
const port = Number(process.env.PORT ?? 4173),
  host = process.env.HOST ?? '127.0.0.1'
server.listen(port, host, () =>
  console.info(`Campus server listening on ${host}:${port}`),
)
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    football.close()
    oat.close()
    server.close()
    server.closeAllConnections()
  })
