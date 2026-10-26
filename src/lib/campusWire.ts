import { CAMPUS_CAPACITY, campusId, parseCampusSnapshot } from './campusProtocol.ts'
import type { CampusPerson, CampusPose, CampusSnapshot } from './campusProtocol.ts'

// Capability-negotiated transport only. The renderer still receives validated
// complete snapshots; physics and the room's authoritative state stay unchanged.
export type CampusPoseRow = [string, null] | [string, number, number, number, number, number, string, number, number | null, number | null]
export interface CampusDelta {
  type: 'campus-delta'; baseSequence: number; sequence: number; serverTime: number
  people: CampusPerson[]; poses: CampusPoseRow[]; removed: string[]
}
const round = (n: number) => Math.round(n * 1000) / 1000
export function campusWireSnapshot(state: CampusSnapshot): CampusSnapshot {
  return { ...state, people: state.people.map(p => ({ ...p, pose: p.pose ? {
    ...p.pose, x: round(p.pose.x), y: round(p.pose.y), z: round(p.pose.z),
    yaw: Math.max(-Math.PI, Math.min(Math.PI, round(p.pose.yaw))),
    pitch: round(p.pose.pitch ?? 0), vehicle: p.pose.vehicle ?? 'walk', airborne: p.pose.airborne ?? false,
  } : null })) }
}
export function campusPoseRow(id: string, pose: CampusPose | null): CampusPoseRow {
  if (!pose) return [id, null]
  const flags = Number(pose.moving) | Number(pose.running) << 1 | Number(pose.active) << 2 | Number(pose.visible) << 3 | Number(!!pose.airborne) << 4 | (pose.vehicle === 'bicycle' ? 32 : pose.vehicle === 'buggy' ? 64 : 0)
  return [id, pose.x, pose.y, pose.z, pose.yaw, flags, pose.space, pose.epoch, pose.pitch ?? null, pose.impactAck ?? null]
}
function rowPose(row: CampusPoseRow): CampusPose | null {
  if (row[1] === null) return null
  const [, x, y, z, yaw, flags, space, epoch, pitch, impactAck] = row
  return { x, y, z, yaw, moving: !!(flags & 1), running: !!(flags & 2), active: !!(flags & 4), visible: !!(flags & 8), airborne: !!(flags & 16), vehicle: flags & 64 ? 'buggy' : flags & 32 ? 'bicycle' : 'walk', space, epoch, ...(pitch === null ? {} : { pitch }), ...(impactAck === null ? {} : { impactAck }) }
}
export function applyCampusDelta(value: unknown, previous: CampusSnapshot | null): CampusSnapshot | null {
  if (!previous || !value || typeof value !== 'object') return null
  const d = value as CampusDelta
  if (d.type !== 'campus-delta' || d.baseSequence !== previous.sequence || !Number.isSafeInteger(d.sequence) || d.sequence <= previous.sequence || !Array.isArray(d.people) || !Array.isArray(d.poses) || !Array.isArray(d.removed) || [d.people, d.poses, d.removed].some(a => a.length > CAMPUS_CAPACITY)) return null
  const people = new Map(previous.people.map(p => [p.id, p])), touched = new Set<string>()
  const touch = (id: unknown): id is string => { if (!campusId(id) || touched.has(id)) return false; touched.add(id); return true }
  for (const id of d.removed) { if (!touch(id) || !people.delete(id)) return null }
  for (const person of d.people) { if (!person || !touch(person.id)) return null; people.set(person.id, person) }
  for (const row of d.poses) {
    if (!Array.isArray(row) || !touch(row[0]) || !people.has(row[0])) return null
    if (row[1] === null ? row.length !== 2 : row.length !== 10 || !Number.isInteger(row[5]) || row[5] < 0 || row[5] > 127 || (row[5] & 96) === 96) return null
    people.set(row[0], { ...people.get(row[0])!, pose: rowPose(row) })
  }
  return parseCampusSnapshot({ type: 'campus-state', sequence: d.sequence, serverTime: d.serverTime, people: [...people.values()] })
}
