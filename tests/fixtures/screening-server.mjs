// Loopback-only rehearsal with synthetic identities. Never imported by runtime.
import { createServer } from 'node:http'
import { attachCampusServer } from '../../server/campusServer.ts'
if (process.env.NODE_ENV === 'production') throw Error('Rehearsal must not run in production.')
const server = createServer((req, res) => {
  if (req.url === '/status') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(campus.access.snapshot())); return }
  res.end('Local screening rehearsal')
})
const campus = attachCampusServer(server, 'http://127.0.0.1:5180', async token => {
  if (!['screening-owner', 'screening-alice', 'screening-bob'].includes(token)) throw Error('Unknown rehearsal identity')
  return { id: token, name: token.replace('screening-', ''), role: token === 'screening-owner' ? 'admin' : 'member', expiresAt: Date.now() + 3600000 }
})
campus.screening.handle({ id: 'screening-owner', name: 'owner', role: 'admin', expiresAt: Date.now() + 3600000 }, { action: 'load', title: 'Chapora movie night · rehearsal', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' })
server.listen(5182, '127.0.0.1', () => console.log('Screening rehearsal on 127.0.0.1:5182'))
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => { campus.close(); server.close() })
