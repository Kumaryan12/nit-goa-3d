import type { CampusSnapshot } from '../src/lib/campusProtocol.ts'

// An opted-out visitor remains part of the nearby shared scene, but their
// coordinates must not be broadcast to distant/other-floor observers.
export function campusSnapshotForViewer(snapshot: CampusSnapshot, viewerId: string): CampusSnapshot {
  if (!snapshot.people.some(p => p.locatorVisible === false)) return snapshot
  const viewer = snapshot.people.find(p => p.id === viewerId)?.pose
  const hidden = new Set(snapshot.people.filter(person => {
    const p = person.pose
    return person.id !== viewerId && person.locatorVisible === false && (!viewer?.visible || !viewer.active || !p?.visible || p.space !== viewer.space || Math.hypot(p.x - viewer.x, p.z - viewer.z) > 160)
  }).map(p => p.id))
  return { ...snapshot, people: snapshot.people.map(person => {
    if (hidden.has(person.id)) {
      const { ride: _ride, impact: _impact, social: _social, ...metadata } = person
      return { ...metadata, pose: null }
    }
    if (person.ride && hidden.has(person.ride.driverId)) {
      const { ride: _ride, ...visible } = person
      return visible
    }
    return person
  }) }
}
