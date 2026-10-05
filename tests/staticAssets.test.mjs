import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { test } from 'node:test'
import { compressAssets } from '../scripts/compress-assets.mjs'
import { acceptedEncodings, serveStaticAsset } from '../server/staticAssets.ts'

test('encoding negotiation respects exclusions, weights, wildcards and identity fallback', () => {
  assert.deepEqual(acceptedEncodings(undefined), ['identity'])
  assert.deepEqual(acceptedEncodings('gzip, br'), ['br', 'gzip', 'identity'])
  assert.deepEqual(acceptedEncodings('br;q=0,gzip;q=.5'), ['gzip', 'identity'])
  assert.deepEqual(acceptedEncodings('*;q=0,gzip;q=.8'), ['gzip'])
  assert.deepEqual(acceptedEncodings('br;q=invalid,gzip;q=0,identity;q=0'), [])
  assert.deepEqual(acceptedEncodings('gzip;q=.2,identity;q=.9'), ['identity', 'gzip'])
  assert.deepEqual(acceptedEncodings('unknown'), ['identity'])
})

test('precompressed public assets round-trip over HTTP, validate caches and preserve HEAD semantics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nitg-compression-'))
  const original = Buffer.from('const message = "campus slopes, courts and multiplayer";\n'.repeat(1000))
  const binary = Buffer.from([0, 1, 2, 3, 4, 255])
  await mkdir(join(root, 'assets'))
  await writeFile(join(root, 'assets', 'scene.js'), original)
  await writeFile(join(root, 'map.json'), original)
  await writeFile(join(root, 'pixel.png'), binary)
  await writeFile(join(root, 'small.js'), 'ok')
  const sizes = await compressAssets(root)
  assert.equal(sizes.count, 2)
  assert.ok(sizes.br < sizes.raw / 4)
  await assert.rejects(readFile(join(root, 'pixel.png.br')), { code: 'ENOENT' })
  await assert.rejects(readFile(join(root, 'small.js.br')), { code: 'ENOENT' })
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    serveStaticAsset(req, res, join(root, path), path.endsWith('.png') ? 'image/png' : 'text/javascript', path.startsWith('/assets/'))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const get = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      const body = []
      res.on('data', chunk => body.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(body) }))
    })
    req.on('error', reject); req.end()
  })
  try {
    const br = await get('/assets/scene.js', { 'Accept-Encoding': 'gzip, br' })
    assert.equal(br.status, 200); assert.equal(br.headers['content-encoding'], 'br')
    assert.equal(br.headers.vary, 'Accept-Encoding')
    assert.match(br.headers['cache-control'], /immutable/)
    assert.equal(Number(br.headers['content-length']), br.body.length)
    assert.deepEqual(brotliDecompressSync(br.body), original)
    const gz = await get('/assets/scene.js', { 'Accept-Encoding': 'br;q=0,gzip' })
    assert.equal(gz.headers['content-encoding'], 'gzip'); assert.deepEqual(gunzipSync(gz.body), original)
    assert.notEqual(gz.headers.etag, br.headers.etag, 'representations have distinct validators')
    const raw = await get('/assets/scene.js')
    assert.equal(raw.headers['content-encoding'], undefined); assert.deepEqual(raw.body, original)
    const head = await get('/assets/scene.js', { 'Accept-Encoding': 'br' }, 'HEAD')
    assert.equal(head.status, 200); assert.equal(head.body.length, 0)
    assert.equal(head.headers['content-length'], br.headers['content-length'])
    const cached = await get('/assets/scene.js', { 'Accept-Encoding': 'br', 'If-None-Match': `W/${br.headers.etag}` })
    assert.equal(cached.status, 304); assert.equal(cached.body.length, 0)
    assert.equal(cached.headers.vary, 'Accept-Encoding')
    assert.equal((await get('/map.json', { 'Accept-Encoding': 'br' })).headers['cache-control'], 'no-cache')
    const png = await get('/pixel.png', { 'Accept-Encoding': 'br, gzip' })
    assert.deepEqual(png.body, binary); assert.equal(png.headers['content-encoding'], undefined)
    assert.equal((await get('/pixel.png', { 'Accept-Encoding': 'br,identity;q=0' })).status, 406)
    assert.equal((await get('/missing.js')).status, 404)
    assert.deepEqual((await get('/small.js', { 'Accept-Encoding': 'br,gzip' })).body, Buffer.from('ok'))
  } finally { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }) }
})
