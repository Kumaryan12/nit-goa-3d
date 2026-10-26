// Real loopback sockets and native zlib; no real accounts or hosting traffic.
import { createServer } from 'node:http'
import { once } from 'node:events'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { WebSocket } from 'ws'
import { attachCampusServer } from '../server/campusServer.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { applyCampusDelta } from '../src/lib/campusWire.ts'

const count = 32, duration = 4000
const boundary = [{ x: -200, z: -200 }, { x: 200, z: -200 }, { x: 200, z: 200 }, { x: -200, z: 200 }, { x: -200, z: -200 }]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const wait = async fn => { const end = performance.now() + 10000; while (performance.now() < end) { if (fn()) return; await sleep(20) } throw Error('Loopback peers did not converge') }
async function run(compact) {
  const server = createServer(), peers = []
  const campus = attachCampusServer(server, undefined, async id => ({ id, name: 'Synthetic ' + id, role: 'member', expiresAt: Date.now() + 60000 }), boundary, [])
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  let tick = 0, timer
  const sendPoses = () => peers.forEach((peer, i) => { if (peer.ready && peer.ws.readyState === WebSocket.OPEN) peer.ws.send(JSON.stringify({ type: 'pose', activity: 'walk', pose: { x: i * 2 + tick * .04, y: 8.123456789, z: Math.sin(tick * .03 + i) * 2, yaw: .4, space: 'outdoors', epoch: 1, moving: tick > 0, running: false, active: true, visible: true, vehicle: 'walk' } })) })
  try {
    for (let i = 0; i < count; i++) {
      const id = `synthetic-${i}`, ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/presence`, { origin: `http://127.0.0.1:${server.address().port}`, perMessageDeflate: compact })
      const peer = { ws, ready: false, state: null, invalid: 0, bytes: 0, received: 0, baseline: 0, messages: 0 }
      peers.push(peer); ws.on('error', () => {})
      // The socket is documented on Node's upgrade response; count actual TCP
      // bytes received, including WebSocket framing/compressed payloads.
      ws.on('upgrade', response => { peer.transport = response.socket })
      ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', token: id })))
      ws.on('message', bytes => {
        const message = JSON.parse(bytes.toString())
        if (message.type === 'campus-welcome') {
          peer.ready = true
          ws.send(JSON.stringify({ type: 'social-capabilities', cafeSeats: true, chaporaSeats: true, ...(compact ? { campusDelta: 1 } : {}) }))
          sendPoses()
        }
        if (message.type !== 'campus-state' && message.type !== 'campus-delta') return
        const next = message.type === 'campus-delta' ? applyCampusDelta(message, peer.state) : parseCampusSnapshot(message)
        if (!next) peer.invalid++; else peer.state = next
        peer.messages++
      })
    }
    await wait(() => peers.every(p => p.ready && p.transport && p.state?.people.length === count && p.state.people.every(p => p.pose)))
    for (const p of peers) { p.baseline = p.transport.bytesRead; p.messages = 0 }
    const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable()
    const cpu = process.cpuUsage(), start = performance.now()
    timer = setInterval(() => { tick++; sendPoses() }, 100)
    await sleep(duration); clearInterval(timer); timer = undefined
    await sleep(150)
    const elapsed = performance.now() - start, usage = process.cpuUsage(cpu)
    loop.disable()
    const bytes = peers.reduce((sum, p) => sum + p.transport.bytesRead - p.baseline, 0)
    if (peers.some(p => p.invalid || p.state.people.length !== count || p.ws.readyState !== WebSocket.OPEN)) throw Error('A loopback peer lost or rejected the shared campus.')
    return { mode: compact ? 'compact + negotiated compression' : 'legacy full snapshots, uncompressed', clients: count, wallMilliseconds: Math.round(elapsed), receivedWireBytes: bytes, totalSnapshots: peers.reduce((sum, p) => sum + p.messages, 0), invalidSnapshots: peers.reduce((sum, p) => sum + p.invalid, 0), eventLoopP99Milliseconds: Number((loop.percentile(99) / 1e6).toFixed(2)), processCPUMilliseconds: Number(((usage.user + usage.system) / 1000).toFixed(1)), processRSSMiB: Number((process.memoryUsage().rss / 1024 ** 2).toFixed(1)) }
  } finally {
    clearInterval(timer); peers.forEach(p => p.ws.terminate()); campus.close(); await new Promise(r => server.close(r))
  }
}
const full = await run(false), compact = await run(true)
console.log(JSON.stringify({ method: '32 synthetic authenticated clients, four seconds moving, actual received TCP bytes after initial sync. Both sides run on this computer; CPU/memory include clients and server, not Render. Not a physical-device performance guarantee.', full, compact, wireReductionPercent: Number((100 * (1 - compact.receivedWireBytes / full.receivedWireBytes)).toFixed(2)) }, null, 2))
