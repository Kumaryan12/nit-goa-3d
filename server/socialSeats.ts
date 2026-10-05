import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SocialSeat } from '../src/lib/social.ts'

// Production builds publish seats from the same map, overrides and terrain as
// the browser. Runtime never imports browser-only data or accepts client seats.
export function publishedSocialSeats(): SocialSeat[] {
  const source = ['dist/map/nit-goa-social-seats.json', 'public/map/nit-goa-social-seats.json'].map(path => resolve(path)).find(existsSync)
  if (!source) return []
  const seats: unknown = JSON.parse(readFileSync(source, 'utf8'))
  if (!Array.isArray(seats) || seats.length > 24) throw new Error('Invalid published OAT seats.')
  const ids = new Set<string>()
  return seats.map((seat: SocialSeat) => {
    if (!seat || typeof seat.id !== 'string' || !/^oat-[3-5]-[0-7]$/.test(seat.id) || ids.has(seat.id) || ![seat.x, seat.y, seat.z, seat.yaw].every(Number.isFinite) || Math.abs(seat.x) > 1200 || Math.abs(seat.z) > 1200 || Math.abs(seat.y) > 64 || Math.abs(seat.yaw) > Math.PI || ![3, 4, 5].includes(seat.row) || seat.id.split('-')[1] !== String(seat.row)) throw new Error('Invalid published OAT seat.')
    ids.add(seat.id)
    return { id: seat.id, x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, row: seat.row }
  })
}
