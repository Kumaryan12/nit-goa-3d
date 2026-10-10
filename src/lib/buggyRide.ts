import { buggySeatPose } from './campusProtocol.ts'
import type { CampusPerson, CampusPose, CampusSession, CampusSnapshot } from './campusProtocol.ts'

export function nearbyCampusBuggies(snapshot: CampusSnapshot | null, selfId: string | null, point: { x: number; z: number } | null) {
  if (!point) return []
  return (snapshot?.people ?? []).filter(person => person.id !== selfId && !person.ride && person.activity === 'walk'
    && person.pose?.vehicle === 'buggy' && person.pose.visible && person.pose.space === 'outdoors'
    && Math.hypot(person.pose.x - point.x, person.pose.z - point.z) <= 4)
    .sort((a, b) => Math.hypot(a.pose!.x - point.x, a.pose!.z - point.z) - Math.hypot(b.pose!.x - point.x, b.pose!.z - point.z))
}

// A seat follows the same rendered driver pose as the buggy, rather than a
// second interpolation of the passenger's world coordinates. On the driver's
// own screen, use the current local pose instead of the delayed network copy.
export function sampleCampusPerson(session: CampusSession, person: CampusPerson, now: number, localPose?: CampusPose | null): CampusPose | null {
  if (!person.ride) return session.motion?.sample(person.id, now) ?? person.pose
  const driver = session.peopleById?.get(person.ride.driverId) ?? session.snapshot?.people.find(p => p.id === person.ride!.driverId)
  if (!person.pose || !driver?.pose || driver.ride || driver.pose.vehicle !== 'buggy') return null
  const sampled = driver.id === session.id && localPose?.vehicle === 'buggy' && localPose.space === 'outdoors'
    ? localPose : session.motion?.sample(driver.id, now) ?? driver.pose
  return { ...buggySeatPose(sampled, person.ride.seat, person.pose.epoch), active: person.pose.active && sampled.active, visible: person.pose.visible && sampled.visible }
}
