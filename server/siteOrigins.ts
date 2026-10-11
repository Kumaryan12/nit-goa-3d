import type { IncomingMessage, ServerResponse } from 'node:http'
export type SiteOrigins = string | readonly string[] | undefined
export function configuredOrigins(site?: string, extra?: string): readonly string[] | undefined {
  const values = [site, ...(extra?.split(',') ?? [])].filter((v): v is string => !!v?.trim())
  if (!values.length) return undefined
  return [...new Set(values.map(value => {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || !/^[a-z0-9.-]+$/.test(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('Campus origins must be exact HTTPS origins without paths or wildcards.')
    return url.origin
  }))]
}
export function allowedSiteOrigin(request: IncomingMessage, origins: SiteOrigins): boolean {
  const origin = request.headers.origin
  const allowed = origins ? typeof origins === 'string' ? [origins] : origins :
    [`http://${request.headers.host}`, `https://${request.headers.host}`]
  return !!origin && allowed.includes(origin)
}
// No cookies or wildcard CORS. Firebase bearer verification remains required.
export function handleCampusCors(request: IncomingMessage, response: ServerResponse, origins: SiteOrigins): boolean {
  if (!request.url?.split('?')[0].startsWith('/api/')) return false
  response.setHeader('Vary', 'Origin')
  const allowed = allowedSiteOrigin(request, origins)
  if (allowed) response.setHeader('Access-Control-Allow-Origin', request.headers.origin!)
  if (request.method !== 'OPTIONS') return false
  const method = request.headers['access-control-request-method']
  const headers = String(request.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean)
  if (!allowed || !['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD'].includes(method ?? '') ||
      headers.some(h => !['authorization', 'content-type', 'x-moderator-token'].includes(h))) {
    response.writeHead(403); response.end(); return true
  }
  response.writeHead(204, {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, HEAD',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Moderator-Token',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
  })
  response.end(); return true
}
