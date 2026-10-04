import type { IncomingMessage, ServerResponse } from 'node:http'
export function sendJSON(res: ServerResponse, status: number, data: unknown) {
  if (res.headersSent) return
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(data))
}
export async function readJSON(req: IncomingMessage, limit = 4096) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))
    throw new Error('Use a JSON request.')
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limit) throw new Error('Request too large.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    throw new Error('Invalid JSON request.')
  }
}
