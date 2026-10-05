import { createReadStream, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'

type Encoding = 'br' | 'gzip' | 'identity'
export function acceptedEncodings(header: string | undefined): Encoding[] {
  if (!header?.trim()) return ['identity']
  const qualities = new Map<string, number>()
  for (const item of header.toLowerCase().split(',')) {
    const [name, ...parameters] = item.trim().split(';'), q = parameters.map(p => p.trim()).find(p => p.startsWith('q='))
    const value = q ? Number(q.slice(2)) : 1
    qualities.set(name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0)
  }
  const weight = (encoding: Encoding) => qualities.get(encoding) ?? (encoding === 'identity' ? qualities.get('*') === 0 ? 0 : .001 : qualities.get('*') ?? 0)
  return (['br', 'gzip', 'identity'] as Encoding[]).filter(e => weight(e) > 0).sort((a, b) => weight(b) - weight(a))
}

// The caller validates the path and keeps private/API responses out of this
// public static-file handler. Variants are prepared once during the build.
export function serveStaticAsset(request: IncomingMessage, response: ServerResponse, file: string, contentType: string, immutable: boolean): void {
  try {
    const original = statSync(file)
    if (!original.isFile()) throw new Error('Not a file')
    let encoding: Encoding | undefined, selected = file, stat = original
    for (const candidate of acceptedEncodings(request.headers['accept-encoding'])) {
      if (candidate === 'identity') { encoding = candidate; break }
      try {
        const path = file + (candidate === 'br' ? '.br' : '.gz'), variant = statSync(path)
        if (variant.isFile()) { encoding = candidate; selected = path; stat = variant; break }
      } catch { /* Older/uncompressed builds still serve the original. */ }
    }
    response.setHeader('Vary', 'Accept-Encoding')
    if (!encoding) { response.writeHead(406); response.end(); return }
    const etag = `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}-${encoding}"`
    response.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
    response.setHeader('ETag', etag)
    const matches = request.headers['if-none-match']?.split(',').some(value => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')
    if (matches) { response.writeHead(304); response.end(); return }
    response.setHeader('Content-Type', contentType)
    response.setHeader('Content-Length', stat.size)
    if (encoding !== 'identity') response.setHeader('Content-Encoding', encoding)
    response.writeHead(200)
    if (request.method === 'HEAD') response.end()
    else createReadStream(selected).on('error', () => response.destroy()).pipe(response)
  } catch {
    if (!response.headersSent) { response.writeHead(404); response.end('Not found') }
    else response.destroy()
  }
}
