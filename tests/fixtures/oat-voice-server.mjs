// Local-only synthetic-audio rehearsal. Never use this identity verifier in production.
import { createServer } from 'node:http'
import { attachOatServer } from '../../server/oatServer.ts'
const http = createServer((req, res) => { if (!oat.handleRequest(req, res)) { res.writeHead(404); res.end() } })
const oat = attachOatServer(http, 'http://127.0.0.1:5176', async token => {
  if (!/^voice-(performer|listener)-[a-f0-9-]{36}$/.test(token)) throw new Error('Fixture token required')
  return { id: token, name: token.split('-')[1], role: 'member', expiresAt: Date.now() + 3600000 }
})
http.listen(4193, '127.0.0.1', () => console.log('Local OAT fixture at 127.0.0.1:4193'))
