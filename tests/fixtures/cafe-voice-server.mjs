// Loopback-only synthetic rehearsal; this verifier is never imported by production.
import { createServer } from 'node:http'
import { attachCampusServer } from '../../server/campusServer.ts'
import { createOatVoiceService } from '../../server/oatVoiceService.ts'
const boundary = [{ x: -100, z: -100 }, { x: 100, z: -100 }, { x: 100, z: 100 }, { x: -100, z: 100 }]
const seats = [0, 1, 2, 3].map(i => ({ id: `cafe-0-${i}`, x: 10 + i, y: 0, z: 10, yaw: 0, row: 0, seatHeight: .44 }))
const http = createServer((_req, res) => { res.writeHead(404); res.end() })
const relay = process.env.CAFE_FIXTURE_RELAY === '1' ? createOatVoiceService() : undefined
const campus = attachCampusServer(http, 'http://127.0.0.1:5176', async token => {
  if (!/^table-[0-3]-[a-f0-9-]{36}$/.test(token)) throw new Error('Fixture token required')
  return { id: token, name: 'Tablemate ' + (Number(token.split('-')[1]) + 1), role: 'member', expiresAt: Date.now() + 3600000 }
}, boundary, seats, undefined, [], relay)
// A shared budget needs its refresh loop in this isolated fixture (OAT owns it in the app).
const poll = relay?.budget ? setInterval(() => void relay.budget.refresh(), 60000) : undefined
if (relay?.budget) void relay.budget.refresh()
http.listen(4194, '127.0.0.1', () => console.log('Local café voice fixture at 127.0.0.1:4194'))
process.once('SIGTERM', () => { clearInterval(poll); campus.close(); http.close() })
