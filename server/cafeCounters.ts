import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CafeCounter } from '../src/lib/cafeDrinks.ts'

export function publishedCafeCounters(): CafeCounter[] {
  const source = ['dist/map/nit-goa-cafe-counters.json', 'public/map/nit-goa-cafe-counters.json'].map(path => resolve(path)).find(existsSync)
  if (!source) return []
  const counters: unknown = JSON.parse(readFileSync(source, 'utf8'))
  if (!Array.isArray(counters) || counters.length > 5) throw new Error('Invalid published café counters.')
  const ids = new Set<string>()
  return counters.map((c: CafeCounter) => {
    if (!c || !/^cafe-(terrace-[01]|front-[0-2])$/.test(c.id) || ids.has(c.id) || ![c.x, c.y, c.z, c.yaw].every(Number.isFinite) || Math.max(Math.abs(c.x), Math.abs(c.z)) > 1200 || Math.abs(c.y) > 64 || Math.abs(c.yaw) > Math.PI) throw new Error('Invalid published café counter.')
    ids.add(c.id); return { id: c.id, x: c.x, y: c.y, z: c.z, yaw: c.yaw }
  })
}
