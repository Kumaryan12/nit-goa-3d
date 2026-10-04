import { PROFILE_COLORS } from './profile.ts'
import type { CampusProfile } from './profile.ts'
export const CAMPUS_CAPACITY = 32
export const NEARBY_CHAT_RADIUS = 35
export const CAMPUS_COLORS = { forest: '#277c77', clay: '#ad684c', ocean: '#388fc1', plum: '#866086' }
export type CampusActivity = 'walk' | 'overview' | 'football' | 'concert'
export interface CampusPose { x: number; y: number; z: number; yaw: number; moving: boolean; running: boolean; active: boolean; visible: boolean; space: string; epoch: number }
export interface CampusPerson { id: string; name: string; handle: string | null; color: CampusProfile['avatar_color']; activity: CampusActivity; pose: CampusPose | null }
export interface CampusSnapshot { type: 'campus-state'; sequence: number; serverTime: number; people: CampusPerson[] }
export interface CampusChat { type: 'chat'; id: string; sender: string; name: string; scope: 'campus' | 'nearby'; text: string; time: number }
export interface CampusSession { id: string | null; snapshot: CampusSnapshot | null }
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
  if (![p.x, p.z].every(v => finite(v, 1200)) || !finite(p.y, 64) || !finite(p.yaw, Math.PI + .001) || ![p.moving, p.running, p.active, p.visible].every(v => typeof v === 'boolean') || !Number.isSafeInteger(p.epoch) || p.epoch < 0 || p.epoch > 1e9 || typeof p.space !== 'string' || !/^(outdoors|hostel:[0-4])$/.test(p.space)) return null
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, moving: p.moving, running: p.running, active: p.active, visible: p.visible, space: p.space, epoch: p.epoch }
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
    ids.add(p.id); people.push({ id: p.id, name: p.name, handle: p.handle, color: p.color, activity: p.activity, pose })
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
