import { PROFILE_COLORS, PROFILE_COLOR_HEX } from './profile.ts'
import type { CampusProfile } from './profile.ts'
import { parseSocialState } from './social.ts'
import type { SocialState } from './social.ts'
export const CAMPUS_CAPACITY = 32
export const NEARBY_CHAT_RADIUS = 35
export const CAMPUS_COLORS = PROFILE_COLOR_HEX
export type CampusActivity = 'walk' | 'overview' | 'football' | 'concert'
export interface CampusPose { airborne?: boolean; pitch?: number; vehicle?: 'walk' | 'bicycle' | 'buggy'; x: number; y: number; z: number; yaw: number; moving: boolean; running: boolean; active: boolean; visible: boolean; space: string; epoch: number }
export interface BuggyRide { driverId: string; seat: 1 | 2 | 3 }
export interface CampusPerson { social?: SocialState; ride?: BuggyRide; id: string; name: string; handle: string | null; color: CampusProfile['avatar_color']; activity: CampusActivity; pose: CampusPose | null }
export interface CampusSnapshot { type: 'campus-state'; sequence: number; serverTime: number; people: CampusPerson[] }
export interface CampusChat { type: 'chat'; id: string; sender: string; name: string; scope: 'campus' | 'nearby'; text: string; time: number }
export interface CampusSession { id: string | null; snapshot: CampusSnapshot | null; correction?: CampusPose }
export function publishedCampusPose(current: CampusPose, walking: boolean, activity: CampusActivity, focused: boolean): CampusPose {
  const visible = walking && current.visible
  return { ...current, yaw: Math.atan2(Math.sin(current.yaw), Math.cos(current.yaw)), visible, active: focused && current.active && (visible || activity === 'concert'), moving: visible && focused && current.moving }
}
export const campusName = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 80) || 'Campus member' : 'Campus member'
export const campusId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
export const campusHandle = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_]{2,23}$/.test(value)
export function chatText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 280) return null
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim()
  return text ? text : null
}
const finite = (value: unknown, bound: number) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= bound
export function parseCampusPose(value: unknown): CampusPose | null {
  if (!value || typeof value !== 'object') return null
  const p = value as CampusPose
  if (![p.x, p.z].every(v => finite(v, 1200)) || !finite(p.y, 64) || !finite(p.yaw, Math.PI + .001) || ![p.moving, p.running, p.active, p.visible].every(v => typeof v === 'boolean') || !Number.isSafeInteger(p.epoch) || p.epoch < 0 || p.epoch > 1e9 || typeof p.space !== 'string' || !/^(outdoors|hostel:[0-4]|gyan:[0-2])$/.test(p.space)) return null
  if (p.pitch !== undefined && !finite(p.pitch, .8)) return null
  if (p.airborne !== undefined && typeof p.airborne !== 'boolean') return null
  if (p.vehicle !== undefined && (!['walk', 'bicycle', 'buggy'].includes(p.vehicle) || p.vehicle !== 'walk' && p.space !== 'outdoors')) return null
  return { ...(p.airborne === undefined ? {} : { airborne: p.airborne }), ...(p.pitch === undefined ? {} : { pitch: p.pitch }), ...(p.vehicle === undefined ? {} : { vehicle: p.vehicle }), x: p.x, y: p.y, z: p.z, yaw: p.yaw, moving: p.moving, running: p.running, active: p.active, visible: p.visible, space: p.space, epoch: p.epoch }
}
export function parseCampusSnapshot(value: unknown): CampusSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const s = value as CampusSnapshot
  if (s.type !== 'campus-state' || !Number.isSafeInteger(s.sequence) || s.sequence < 0 || !finite(s.serverTime, 1e14) || !Array.isArray(s.people) || s.people.length > CAMPUS_CAPACITY) return null
  const ids = new Set<string>(), people: CampusPerson[] = []
  for (const p of s.people) {
    if (!p || !campusId(p.id) || ids.has(p.id) || p.name !== campusName(p.name) || !(p.handle === null || campusHandle(p.handle)) || !PROFILE_COLORS.includes(p.color) || !['walk', 'overview', 'football', 'concert'].includes(p.activity)) return null
    const pose = p.pose === null ? null : parseCampusPose(p.pose)
    if (p.pose !== null && !pose) return null
    if (p.ride !== undefined && (!p.ride || !campusId(p.ride.driverId) || p.ride.driverId === p.id || ![1, 2, 3].includes(p.ride.seat) || !pose || pose.space !== 'outdoors' || (pose.vehicle ?? 'walk') !== 'walk')) return null
    const social = p.social === undefined ? undefined : parseSocialState(p.social)
    if (p.social !== undefined && (!social || p.ride || !pose || pose.airborne || (pose.vehicle ?? 'walk') !== 'walk' || p.activity === 'football' || social.action === 'sit' && (p.activity !== 'walk' || pose.space !== 'outdoors'))) return null
    ids.add(p.id); people.push({ ...(social ? { social } : {}), ...(p.ride ? { ride: { driverId: p.ride.driverId, seat: p.ride.seat } } : {}), id: p.id, name: p.name, handle: p.handle, color: p.color, activity: p.activity, pose })
  }
  const seats = new Set<string>()
  const socialSeats = new Set<string>()
  for (const p of people) if (p.social?.seatId) {
    if (socialSeats.has(p.social.seatId)) return null
    socialSeats.add(p.social.seatId)
  }
  for (const p of people) if (p.ride) {
    const driver = people.find(d => d.id === p.ride!.driverId), seat = `${p.ride.driverId}:${p.ride.seat}`
    if (!driver || driver.ride || driver.pose?.vehicle !== 'buggy' || seats.has(seat)) return null
    seats.add(seat)
  }
  return { type: 'campus-state', sequence: s.sequence, serverTime: s.serverTime, people }
}
export function parseCampusChat(value: unknown): CampusChat | null {
  if (!value || typeof value !== 'object') return null
  const m = value as CampusChat
  if (m.type !== 'chat' || !campusId(m.id) || !campusId(m.sender) || m.name !== campusName(m.name) || !['campus', 'nearby'].includes(m.scope) || typeof m.text !== 'string' || chatText(m.text) !== m.text || !finite(m.time, 1e14)) return null
  return { type: 'chat', id: m.id, sender: m.sender, name: m.name, scope: m.scope, text: m.text, time: m.time }
}
export function canHearNearby(a: CampusPose | null, b: CampusPose | null) {
  return !!(a?.visible && b?.visible && a.space === b.space && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= NEARBY_CHAT_RADIUS)
}

// Local positions in the four-seat open buggy; seat zero belongs to its driver.
export const BUGGY_SEATS = [{ x: .36, z: -.46 }, { x: -.36, z: -.46 }, { x: .36, z: .62 }, { x: -.36, z: .62 }] as const
export function buggySeatPose(driver: CampusPose, seat: 1 | 2 | 3, epoch: number): CampusPose {
  const local = BUGGY_SEATS[seat], c = Math.cos(driver.yaw), s = Math.sin(driver.yaw), pitch = driver.pitch ?? 0
  const z = local.z * Math.cos(pitch) + .23 * Math.sin(pitch), y = .23 * Math.cos(pitch) - local.z * Math.sin(pitch)
  return { ...driver, vehicle: 'walk', x: driver.x + local.x * c + z * s, z: driver.z - local.x * s + z * c, y: driver.y + y, running: false, epoch }
}
