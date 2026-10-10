// Local-only synthetic-audio rehearsal. Never use this identity verifier in production.
import { createServer } from 'node:http'
import { attachOatServer } from '../../server/oatServer.ts'
import { createOatUsageMonitor } from '../../server/oatUsage.ts'
import { createOatIceProvider } from '../../server/oatIce.ts'
let bytes = 0, saved = { usedBytes: 0, blocked: false, warningLevel: 0 }
const budget = process.env.OAT_FIXTURE_QUOTA === '1' ? createOatUsageMonitor(new Date().toISOString().slice(0, 10), async () => bytes, async (_cycle, amount) => {
  saved = { usedBytes: Math.max(saved.usedBytes, amount), blocked: saved.blocked || amount >= 900e9, warningLevel: amount >= 850e9 ? 2 : amount >= 700e9 ? 1 : 0 }; return saved
}) : undefined
const http = createServer((req, res) => {
  if (budget && req.url === '/fixture/quota' && req.method === 'POST' && req.headers.origin === 'http://127.0.0.1:5176') {
    bytes = 901e9; void budget.refresh(true).then(() => { res.writeHead(200, { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5176' }); res.end('Fixture quota reached') }); return
  }
  if (!oat.handleRequest(req, res)) { res.writeHead(404); res.end() }
})
const oat = attachOatServer(http, 'http://127.0.0.1:5176', async token => {
  if (!/^voice-(performer|listener)-[a-f0-9-]{36}$/.test(token)) throw new Error('Fixture token required')
  return { id: token, name: token.split('-')[1], role: 'member', expiresAt: Date.now() + 3600000 }
}, budget ? { budget, iceProvider: createOatIceProvider(process.env, fetch, Date.now, { ttl: 600, allowed: budget.allowed }) } : undefined)
http.listen(4193, '127.0.0.1', () => console.log('Local OAT fixture at 127.0.0.1:4193'))
