import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { gpsToLocal, validClosedRing } from '../src/lib/geo.ts'
import type { LocalCoordinate } from '../src/lib/geo.ts'
import { pointInCampus } from '../src/lib/roads.ts'
import { PROFILE_COLORS } from '../src/lib/profile.ts'
import { CAMPUS_CAPACITY, campusName, campusHandle, chatText, canHearNearby, parseCampusPose } from '../src/lib/campusProtocol.ts'
import type { CampusPerson, CampusSnapshot, CampusChat, CampusActivity } from '../src/lib/campusProtocol.ts'
import type { CampusIdentity } from './access.ts'

export function publishedCampusBoundary(): LocalCoordinate[] {
  const source = ['dist/map/nit-goa-campus.json', 'public/map/nit-goa-campus.json'].map(p => resolve(p)).find(existsSync)
  if (!source) throw new Error('Published campus boundary is required for shared presence.')
  const data = JSON.parse(readFileSync(source, 'utf8'))
  const ring = validClosedRing(data.elements?.find((e: { type: string; id: number }) => e.type === 'way' && e.id === 1259742369)?.geometry)
  if (!ring) throw new Error('Invalid published campus boundary.')
  return ring.map(gpsToLocal)
}
export function createCampusRoom(boundary: LocalCoordinate[]) {
  if (boundary.length < 4) throw new Error('Campus presence requires a closed boundary.')
  const members = new Map<string, { person: CampusPerson; poseAt: number; spawnAt: number }>()
  const chatLimits = new Map<string, number[]>(), history: CampusChat[] = []
  let sequence = 0
  const metadata = (identity: CampusIdentity) => ({ name: campusName(identity.name), handle: campusHandle(identity.publicHandle) ? identity.publicHandle : null, color: PROFILE_COLORS.includes(identity.avatarColor!) ? identity.avatarColor! : 'forest' as const })
  const prune = (now: number) => {
    while (history.length && (history.length > 50 || now - history[0].time > 15 * 60000)) history.shift()
    for (const [id, times] of chatLimits) if (now - times.at(-1)! > 60000) chatLimits.delete(id)
  }
  return {
    add(identity: CampusIdentity) {
      if (members.size >= CAMPUS_CAPACITY || members.has(identity.id)) return null
      const person: CampusPerson = { id: identity.id, ...metadata(identity), activity: 'overview', pose: null }
      members.set(identity.id, { person, poseAt: 0, spawnAt: -Infinity }); return person
    },
    updateIdentity(identity: CampusIdentity) {
      const member = members.get(identity.id)
      if (member) Object.assign(member.person, metadata(identity))
    },
    remove(id: string) { members.delete(id) },
    removeMessages(id: string) { for (let i = history.length - 1; i >= 0; i--) if (history[i].sender === id) history.splice(i, 1) },
    pose(id: string, input: unknown, activity: unknown, now = Date.now()) {
      const member = members.get(id), pose = parseCampusPose(input)
      if (!member || !pose || !['walk', 'overview', 'football', 'concert'].includes(activity as string) || !pointInCampus(pose, boundary) || now - member.poseAt < 70) return false
      const previous = member.person.pose
      const relocated = !previous || previous.epoch !== pose.epoch
      if (relocated && now - member.spawnAt < 1000) return false
      if (previous && !relocated) {
        const elapsed = Math.min(.5, Math.max(0, (now - member.poseAt) / 1000))
        if (Math.hypot(pose.x - previous.x, pose.z - previous.z) > 5.8 * elapsed + .4 || Math.abs(pose.y - previous.y) > 6 * elapsed + .5) return false
      }
      if (relocated) member.spawnAt = now
      pose.moving = pose.active && pose.visible && !!previous && !relocated && Math.hypot(pose.x - previous.x, pose.z - previous.z) > .005
      member.person.pose = pose; member.person.activity = activity as CampusActivity; member.poseAt = now
      return true
    },
    chat(id: string, text: unknown, scope: unknown, now = Date.now()): { message: CampusChat; recipients: string[] } | { error: string } {
      prune(now)
      const member = members.get(id), clean = chatText(text)
      if (!member) return { error: 'Join the campus before chatting.' }
      if (!clean || !['campus', 'nearby'].includes(scope as string)) return { error: 'Write a message of 1–280 characters.' }
      if (scope === 'nearby' && (!member.person.pose?.visible || now - member.poseAt > 2000)) return { error: 'Start walking to use nearby chat.' }
      const recent = (chatLimits.get(id) ?? []).filter(t => now - t < 10000)
      if (recent.length >= 5 || (recent.length && now - recent.at(-1)! < 1000)) return { error: 'Give others a moment. Try again shortly.' }
      if (!chatLimits.has(id) && chatLimits.size >= 4096) return { error: 'Chat is busy. Try again shortly.' }
      recent.push(now); chatLimits.set(id, recent)
      const message: CampusChat = { type: 'chat', id: randomUUID(), sender: id, name: member.person.name, scope: scope as CampusChat['scope'], text: clean, time: now }
      if (scope === 'campus') { history.push(message); prune(now) }
      const recipients = [...members.entries()].filter(([, m]) => scope === 'campus' || (now - m.poseAt <= 2000 && canHearNearby(member.person.pose, m.person.pose))).map(([id]) => id)
      return { message, recipients }
    },
    history(now = Date.now()) { prune(now); return history.map(m => ({ ...m })) },
    snapshot(now = Date.now()): CampusSnapshot {
      prune(now)
      return { type: 'campus-state', sequence: ++sequence, serverTime: now, people: [...members.values()].map(m => ({ ...m.person, pose: m.person.pose ? { ...m.person.pose, active: m.person.pose.active && now - m.poseAt < 2000, moving: m.person.pose.moving && now - m.poseAt < 500, visible: m.person.pose.visible && now - m.poseAt < 15000 } : null })) }
    },
  }
}
