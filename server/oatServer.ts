import { randomUUID } from 'node:crypto'
import { attachLiveAccess } from './liveAccess.ts'
import type { VerifyAccess } from './access.ts'
import type { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { createOatRoom } from './oatRoom.ts'
import {
  OAT_CAPACITY,
  OAT_UPLOAD_LIMIT,
  parseOatSignal,
} from '../src/lib/oatProtocol.ts'

interface OatSocket {
  ws: WebSocket
  token: string
  signalCount: number
  signalWindow: number
}
interface AudioAsset {
  bytes: Buffer
  type: string
  createdAt: number
}
const audioType = (bytes: Buffer): string | null => {
  if (bytes.length < 12) return null
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WAVE'
  )
    return 'audio/wav'
  if (bytes.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg'
  if (
    bytes.toString('ascii', 0, 3) === 'ID3' ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
    return 'audio/mpeg'
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4'
  if (bytes.readUInt32BE(0) === 0x1a45dfa3) return 'audio/webm'
  if (bytes.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac'
  return null
}
export function attachOatServer(
  server: EventEmitter,
  origin?: string,
  verify?: VerifyAccess,
) {
  const room = createOatRoom(),
    peers = new Map<string, OatSocket>(),
    assets = new Map<string, AudioAsset>(),
    uploading = new Set<string>()
  const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 32768,
      perMessageDeflate: false,
    }),
    alive = new WeakSet<WebSocket>()
  const allowed = (req: IncomingMessage) =>
    !!req.headers.origin &&
    (origin
      ? req.headers.origin === origin
      : [`http://${req.headers.host}`, `https://${req.headers.host}`].includes(
          req.headers.origin,
        ))
  const send = (ws: WebSocket, message: unknown) => {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 131072)
      ws.send(JSON.stringify(message))
  }
  const broadcast = () => {
    const state = room.snapshot()
    for (const peer of peers.values()) send(peer.ws, state)
  }
  const access = attachLiveAccess(
    server,
    wss,
    '/oat',
    origin,
    OAT_CAPACITY,
    verify,
  )
  access.onAdmit((ws, identity) => {
    const id = identity.id,
      participant = room.add(id)
    if (!participant) {
      ws.close(1013, 'OAT full')
      return
    }
    room.handle(id, { type: 'name', name: identity.name })
    const peer: OatSocket = {
      ws,
      token: randomUUID(),
      signalCount: 0,
      signalWindow: Date.now(),
    }
    peers.set(id, peer)
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))
    ws.on('error', () => undefined)
    send(ws, { type: 'welcome', id, uploadToken: peer.token })
    broadcast()
    ws.on('message', (bytes, binary) => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (binary) return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(bytes.toString())
        if (!msg || typeof msg !== 'object') return
      } catch {
        return
      }
      if (msg.type === 'name' || msg.type === 'authenticate') return // Verified by the access gate.
      if (msg.type === 'clock' && Number.isFinite(msg.clientTime)) {
        send(ws, {
          type: 'clock',
          clientTime: msg.clientTime,
          serverTime: Date.now(),
        })
        return
      }
      if (msg.type === 'voice-ready') {
        const state = room.snapshot(),
          performer = state.performerId ? peers.get(state.performerId) : null
        if (performer && state.micOn && state.performerId !== id)
          send(performer.ws, { type: 'voice-ready', from: id })
        return
      }
      if (msg.type === 'signal') {
        const target = typeof msg.to === 'string' ? peers.get(msg.to) : null,
          signal = parseOatSignal(msg.signal),
          state = room.snapshot()
        // Only performer → listener offers and listener → performer answers.
        if (
          !target ||
          msg.to === id ||
          !signal ||
          !state.micOn ||
          (state.performerId !== id && state.performerId !== msg.to)
        )
          return
        if (
          (signal.kind === 'offer' && state.performerId !== id) ||
          (signal.kind === 'answer' && state.performerId !== msg.to)
        )
          return
        if (Date.now() - peer.signalWindow > 10000) {
          peer.signalCount = 0
          peer.signalWindow = Date.now()
        }
        if (++peer.signalCount > 240) return
        send(target.ws, { type: 'signal', from: id, signal })
        return
      }
      if (
        msg.type === 'track' &&
        typeof msg.url === 'string' &&
        msg.url.startsWith('/oat/audio/') &&
        !assets.has(msg.url)
      ) {
        send(ws, {
          type: 'error',
          message: 'That shared file has expired. Upload it again.',
        })
        return
      }
      const error = room.handle(id, msg)
      if (error) send(ws, { type: 'error', message: error })
      else broadcast()
    })
    ws.on('close', () => {
      peers.delete(id)
      room.remove(id)
      if (!peers.size) assets.clear()
      broadcast()
    })
  })
  const timer = setInterval(() => {
    if (peers.size) broadcast()
    const current = room.snapshot().music.url
    for (const [url, asset] of assets)
      if (url !== current && Date.now() - asset.createdAt > 1800000)
        assets.delete(url)
  }, 1000)
  const heartbeat = setInterval(() => {
    for (const { ws } of peers.values()) {
      if (!alive.has(ws)) ws.terminate()
      else {
        alive.delete(ws)
        ws.ping()
      }
    }
  }, 30000)
  timer.unref()
  heartbeat.unref()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    clearInterval(timer)
    clearInterval(heartbeat)
    access.close()
    assets.clear()
  }
  server.once('close', close)
  const handleRequest = (
    request: IncomingMessage,
    response: ServerResponse,
  ): boolean => {
    const path = request.url?.split('?')[0] ?? ''
    if (!path.startsWith('/oat/audio')) return false
    if (allowed(request))
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin!)
    response.setHeader('Vary', 'Origin')
    if (request.method === 'OPTIONS') {
      if (!allowed(request)) {
        response.writeHead(403)
        response.end()
        return true
      }
      response.writeHead(204, {
        'Access-Control-Allow-Methods': 'POST, GET, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, X-Oat-Token',
        'Access-Control-Max-Age': '600',
      })
      response.end()
      return true
    }
    const fail = (status: number, message: string) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      response.end(JSON.stringify({ error: message }))
      request.resume()
    }
    if (path === '/oat/audio' && request.method === 'POST') {
      const id = [...peers].find(
        ([, p]) =>
          p.token === request.headers['x-oat-token'] &&
          p.ws.readyState === WebSocket.OPEN,
      )?.[0]
      if (!allowed(request) || !id || !room.isPerformer(id)) {
        fail(403, 'Take the stage before sharing a file.')
        return true
      }
      if (uploading.has(id) || uploading.size >= 2) {
        fail(429, 'An upload is already in progress.')
        return true
      }
      if (Number(request.headers['content-length']) > OAT_UPLOAD_LIMIT) {
        fail(413, 'Choose an audio file smaller than 12 MB.')
        return true
      }
      uploading.add(id)
      const chunks: Buffer[] = []
      let size = 0,
        rejected = false
      const release = () => uploading.delete(id)
      request.on('aborted', release)
      request.on('error', release)
      request.on('data', (chunk: Buffer) => {
        if (rejected) return
        size += chunk.length
        if (size > OAT_UPLOAD_LIMIT) {
          rejected = true
          chunks.length = 0
          release()
          fail(413, 'Choose an audio file smaller than 12 MB.')
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        release()
        if (rejected) return
        if (closed || !room.isPerformer(id)) {
          fail(403, 'Your stage turn ended.')
          return
        }
        const bytes = Buffer.concat(chunks),
          type = audioType(bytes)
        if (!type) {
          fail(415, 'Choose an MP3, WAV, OGG, M4A, WebM or FLAC audio file.')
          return
        }
        // Keep the playing track and a bounded set of recent uploads.
        if (assets.size >= 4)
          for (const url of assets.keys())
            if (url !== room.snapshot().music.url) {
              assets.delete(url)
              break
            }
        const url = `/oat/audio/${randomUUID()}`
        assets.set(url, { bytes, type, createdAt: Date.now() })
        response.writeHead(201, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        })
        response.end(JSON.stringify({ url }))
      })
      return true
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fail(405, 'Method not supported.')
      return true
    }
    const asset = assets.get(path)
    if (!asset) {
      fail(404, 'Audio file unavailable.')
      return true
    }
    const headers = {
      'Content-Type': asset.type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    }
    let start = 0,
      end = asset.bytes.length - 1,
      status = 200
    if (request.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range)
      if (
        !match ||
        Number(match[1]) > end ||
        (match[2] && Number(match[2]) < Number(match[1]))
      ) {
        response.writeHead(416, {
          ...headers,
          'Content-Range': `bytes */${asset.bytes.length}`,
        })
        response.end()
        return true
      }
      start = Number(match[1])
      if (match[2]) end = Math.min(end, Number(match[2]))
      status = 206
    }
    response.writeHead(status, {
      ...headers,
      'Content-Length': end - start + 1,
      ...(status === 206
        ? { 'Content-Range': `bytes ${start}-${end}/${asset.bytes.length}` }
        : {}),
    })
    if (request.method === 'HEAD') response.end()
    else response.end(asset.bytes.subarray(start, end + 1))
    return true
  }
  return {
    close,
    room,
    handleRequest,
    access,
    endStage(id: string) {
      room.handle(id, { type: 'leave-stage' })
      broadcast()
    },
  }
}
