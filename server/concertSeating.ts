import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { concertPlacement } from '../src/lib/concertSeating.ts'
import type { ConcertLayout } from '../src/lib/concertSeating.ts'
import type { OatSnapshot } from '../src/lib/oatProtocol.ts'
import type { CampusSnapshot } from '../src/lib/campusProtocol.ts'

export function publishedConcertLayout(): ConcertLayout {
  const file = ['dist/map/nit-goa-concert-layout.json', 'public/map/nit-goa-concert-layout.json'].map(path => resolve(path)).find(existsSync)
  if (!file) throw new Error('Published concert layout is required.')
  const layout = JSON.parse(readFileSync(file, 'utf8')) as ConcertLayout
  const validPlace = (p: ConcertLayout['stage']) => p && [p.x, p.y, p.z, p.yaw].every(Number.isFinite) && Math.abs(p.x) <= 1200 && Math.abs(p.z) <= 1200 && Math.abs(p.y) <= 64 && Math.abs(p.yaw) <= Math.PI
  if (!layout || !validPlace(layout.stage) || !Array.isArray(layout.seats) || layout.seats.length !== 24 || !layout.seats.every((seat, index) => validPlace(seat) && seat.row === Math.floor(index / 8) && seat.id === `oat-${seat.row}-${index % 8}`)) throw new Error('Invalid published concert layout.')
  return layout
}

// Seats come from authenticated OAT membership, never a visitor-supplied pose.
// Bystanders also see the audience without joining the concert socket.
export function seatConcertVisitors(snapshot: CampusSnapshot, concert: OatSnapshot | null, layout: ConcertLayout): CampusSnapshot {
  return { ...snapshot, people: snapshot.people.map(person => {
    const place = concertPlacement(layout, concert, person.id)
    if (!place) {
      if (person.ride && concert?.participants.some(p => p.id === person.ride!.driverId)) {
        const { ride: _ride, ...standing } = person
        return standing
      }
      return person
    }
    const { ride: _ride, impact: _impact, social, ...member } = person
    return { ...member, ...(social?.action !== 'sit' && social ? { social } : {}), concert: { seat: place.seat, role: place.role }, activity: 'concert', pose: { x: place.x, y: place.y, z: place.z, yaw: place.yaw, vehicle: 'walk', moving: false, running: false, airborne: false, active: person.pose?.active ?? false, visible: true, space: 'outdoors', epoch: person.pose?.epoch ?? 0 } }
  }) }
}
