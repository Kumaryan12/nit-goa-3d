import type { CampusPerson, CampusPose, CampusSnapshot } from './campusProtocol.ts'
import type { LocalCoordinate } from './geo.ts'

export interface FinderLandmark { id: string; name: string; coordinates: LocalCoordinate }
export interface LocatedPerson { person: CampusPerson; distance: number; bearing: number; sameSpace: boolean; location: string }
export const FINDER_INTERVAL_MS = 250
export const FINDER_STALE_MS = 2500
export function readFinderPreference(value: string | null): boolean { return value !== 'off' }

export function personLocation(pose: CampusPose, landmarks: FinderLandmark[]): string {
  const indoor = /^(hostel|gyan):([0-4])$/.exec(pose.space)
  if (indoor) return `${indoor[1] === 'hostel' ? 'Boys Hostel' : 'Gyan Mandir'} · ${indoor[2] === '0' ? 'Ground floor' : `Floor ${indoor[2]}`}`
  let nearest: FinderLandmark | undefined, distance = Infinity
  for (const landmark of landmarks) {
    const d = Math.hypot(pose.x - landmark.coordinates.x, pose.z - landmark.coordinates.z)
    if (d < distance) { nearest = landmark; distance = d }
  }
  return nearest && distance <= 160 ? `Near ${nearest.name}` : 'Around campus'
}
// Read the live snapshot rather than the roster, which deliberately does not
// rerender on each movement packet. Never retain a departed target.
export function locatePeople(snapshot: CampusSnapshot | null, selfId: string | null, ownPose: CampusPose | null, landmarks: FinderLandmark[], muted: ReadonlySet<string>, now = Date.now()): LocatedPerson[] {
  if (!snapshot || !ownPose?.visible || !selfId || now - snapshot.serverTime > FINDER_STALE_MS || snapshot.serverTime - now > 10000) return []
  return snapshot.people.flatMap(person => {
    const p = person.pose
    if (person.id === selfId || muted.has(person.id) || person.locatorVisible === false || !p?.visible || !p.active) return []
    const distance = Math.hypot(p.x - ownPose.x, p.z - ownPose.z)
    // Avatar forward is (-sin(yaw), -cos(yaw)). Positive means turn right.
    const angle = Math.atan2(p.x - ownPose.x, -(p.z - ownPose.z)) + ownPose.yaw
    const bearing = Math.atan2(Math.sin(angle), Math.cos(angle))
    return [{ person, distance, bearing, sameSpace: p.space === ownPose.space, location: personLocation(p, landmarks) }]
  }).sort((a, b) => a.distance - b.distance || a.person.id.localeCompare(b.person.id))
}
