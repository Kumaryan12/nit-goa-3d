// Synthetic traffic only: no Firebase, real users, hosting requests or billing.
// Run: node --experimental-strip-types scripts/benchmark-live-bandwidth.mjs
import { isDeepStrictEqual } from 'node:util'
import { performance } from 'node:perf_hooks'
import { deflateRawSync, constants } from 'node:zlib'
import { CampusStream } from '../server/campusStream.ts'
import { campusWireSnapshot, applyCampusDelta } from '../src/lib/campusWire.ts'
import { parseCampusSnapshot } from '../src/lib/campusProtocol.ts'
import { liveCompression } from '../server/liveBandwidth.ts'

const seconds = 60, hz = 10
function replay(count, moving) {
  const stream = new CampusStream()
  let raw = 0, compact = 0, compressed = 0, messages = 0, received = null
  const started = performance.now()
  for (let tick = 0; tick < seconds * hz; tick++) {
    const people = Array.from({ length: count }, (_, i) => ({
      id: `synthetic-student-${i.toString().padStart(2, '0')}`, name: `Campus Student ${i + 1}`, handle: `student_${i + 1}`, avatarStyle: i % 2 ? 'girl' : 'boy', color: 'forest', activity: 'walk', locatorVisible: false,
      pose: { x: i * 2 + (moving ? tick * .25 : 0), y: 8.123456789, z: i * 1.27 + (moving ? Math.sin(tick * .03 + i) * 3 : 0), yaw: moving ? .4 + Math.sin(tick * .03) * .2 : .4, epoch: 1, vehicle: 'walk', pitch: 0, airborne: false, active: true, visible: true, moving, running: false, space: 'outdoors' },
    }))
    const state = { type: 'campus-state', sequence: tick + 1, serverTime: 10000 + tick * 100, people }
    raw += Buffer.byteLength(JSON.stringify(state))
    const message = stream.next(state, true, tick * 100)
    if (!message) continue
    const frame = JSON.parse(message)
    received = frame.type === 'campus-delta' ? applyCampusDelta(frame, received) : parseCampusSnapshot(frame)
    if (!received || !isDeepStrictEqual(received, campusWireSnapshot(state))) throw Error('Compact scene reconstruction differs from the full snapshot.')
    messages++; compact += Buffer.byteLength(message)
    // Same independently compressed message settings as ws; framing not counted.
    compressed += Buffer.byteLength(message) < liveCompression.threshold ? Buffer.byteLength(message) : deflateRawSync(message, { level: 1, memLevel: 4, windowBits: 10, flush: constants.Z_SYNC_FLUSH, finishFlush: constants.Z_SYNC_FLUSH }).length - 4
  }
  return { users: count, activity: moving ? 'everyone walking' : 'everyone stationary', simulatedSeconds: seconds, baselineMessagesPerViewer: hz * seconds, newMessagesPerViewer: messages, baselinePayloadBytesPerViewer: raw, compactPayloadBytesPerViewer: compact, compressedPayloadBytesPerViewer: compressed, estimatedRoomPayloadMBPerMinute: Number((compressed * count / 1e6).toFixed(3)), payloadReductionPercent: Number((100 * (1 - compressed / raw)).toFixed(2)), replayMilliseconds: Number((performance.now() - started).toFixed(1)) }
}
console.log(JSON.stringify({ method: '60-second deterministic replay; decoded scene validated for every emitted packet; compression payload only, excluding network framing/handshakes. This is not measured Render usage or a capacity guarantee.', scenarios: [2, 8, 32].flatMap(n => [replay(n, false), replay(n, true)]) }, null, 2))
