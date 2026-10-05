import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { gpsToLocal, localToGps, pointInRing, validClosedRing } from '../src/lib/geo.ts'
import type { LocalCoordinate } from '../src/lib/geo.ts'
import { allocateAvatarColor, defaultAvatarColor, isAvatarColor } from '../src/lib/profile.ts'
import type { AvatarColor } from '../src/lib/profile.ts'
import { CAMPUS_CAPACITY, campusName, campusHandle, chatText, canHearNearby, parseCampusPose, buggySeatPose, campusId } from '../src/lib/campusProtocol.ts'
import type { CampusPerson, CampusSnapshot, CampusChat, CampusActivity, CampusPose, BuggyRide } from '../src/lib/campusProtocol.ts'
import type { CampusIdentity } from './access.ts'
import { presenceSpeedLimit } from '../src/lib/movementLimits.ts'
import { isSocialAction, SOCIAL_DURATION } from '../src/lib/social.ts'
import type { SocialSeat } from '../src/lib/social.ts'

export function publishedCampusBoundary(): LocalCoordinate[] {
  const source = ['dist/map/nit-goa-campus.json', 'public/map/nit-goa-campus.json'].map(p => resolve(p)).find(existsSync)
  if (!source) throw new Error('Published campus boundary is required for shared presence.')
  const data = JSON.parse(readFileSync(source, 'utf8'))
  const ring = validClosedRing(data.elements?.find((e: { type: string; id: number }) => e.type === 'way' && e.id === 1259742369)?.geometry)
  if (!ring) throw new Error('Invalid published campus boundary.')
  return ring.map(gpsToLocal)
}
export function createCampusRoom(boundary: LocalCoordinate[], seats: SocialSeat[] = []) {
  if (boundary.length < 4) throw new Error('Campus presence requires a closed boundary.')
  const region = boundary.map(localToGps)
  const members = new Map<string, { person: CampusPerson; preferredColor: AvatarColor; poseAt: number; spawnAt: number; seatOrigin?: CampusPose }>()
  const rideLimits = new Map<string, number>()
  const socialLimits = new Map<string, number[]>()
  const socialSeats = new Map(seats.map(seat => [seat.id, seat]))
  const chatLimits = new Map<string, number[]>(), history: CampusChat[] = []
  let sequence = 0
  const preferredColor = (identity: CampusIdentity) => isAvatarColor(identity.avatarColor) ? identity.avatarColor : defaultAvatarColor(identity.id)
  const metadata = (identity: CampusIdentity) => ({ name: campusName(identity.name), handle: campusHandle(identity.publicHandle) ? identity.publicHandle : null })
  const assignColor = (identity: CampusIdentity) => allocateAvatarColor(identity.id, preferredColor(identity), [...members.values()].filter(member => member.person.id !== identity.id).map(member => member.person.color))
  const prune = (now: number) => {
    while (history.length && (history.length > 50 || now - history[0].time > 15 * 60000)) history.shift()
    for (const [id, times] of chatLimits) if (now - times.at(-1)! > 60000) chatLimits.delete(id)
    for (const [id, times] of socialLimits) if (now - times.at(-1)! > 60000) socialLimits.delete(id)
  }
  const nextEpoch = (epoch: number) => (epoch + 1) % 1000000001
  const stopSocial = (id: string, now: number) => {
    const member = members.get(id)
    if (!member) return
    if (member.seatOrigin && member.person.pose) {
      const { active, visible, epoch } = member.person.pose
      member.person.pose = { ...member.seatOrigin, active, visible, moving: false, running: false, airborne: false, epoch: nextEpoch(epoch) }
      member.spawnAt = now
    }
    delete member.seatOrigin; delete member.person.social
  }
  const syncSocial = (now: number) => {
    for (const [id, member] of members) {
      const social = member.person.social, pose = member.person.pose
      if (social && (now >= social.until || now - member.poseAt >= 2000 || !pose?.active || !pose.visible && member.person.activity !== 'concert')) stopSocial(id, now)
    }
  }
  const release = (id: string, now: number) => {
    const member = members.get(id), ride = member?.person.ride
    if (!member || !ride) return
    const driver = members.get(ride.driverId)?.person.pose
    if (member.person.pose) member.person.pose = { ...member.person.pose, ...(driver ? { x: driver.x, y: driver.y, z: driver.z, yaw: driver.yaw } : { y: member.person.pose.y - .23 }), vehicle: 'walk', pitch: 0, moving: false, running: false, epoch: member.person.pose.epoch + 1 }
    delete member.person.ride; member.spawnAt = now; member.poseAt = now
  }
  const releasePassengers = (driverId: string, now: number) => { for (const [id, member] of members) if (member.person.ride?.driverId === driverId) release(id, now) }
  const syncRides = (now: number) => {
    for (const [id, member] of members) {
      const ride = member.person.ride
      if (!ride) continue
      const driver = members.get(ride.driverId), p = driver?.person.pose
      if (!driver || !p || driver.person.ride || p.vehicle !== 'buggy' || p.space !== 'outdoors' || !p.visible || driver.person.activity !== 'walk' || now - driver.poseAt > 2000) { release(id, now); continue }
      if (member.person.pose) {
        const active = member.person.pose.active, visible = member.person.pose.visible
        member.person.pose = { ...buggySeatPose(p, ride.seat, member.person.pose.epoch), active: active && p.active, visible }
      }
    }
  }
  return {
    add(identity: CampusIdentity) {
      if (members.size >= CAMPUS_CAPACITY || members.has(identity.id)) return null
      const person: CampusPerson = { id: identity.id, ...metadata(identity), color: assignColor(identity), activity: 'overview', pose: null }
      members.set(identity.id, { person, preferredColor: preferredColor(identity), poseAt: 0, spawnAt: -Infinity }); return person
    },
    updateIdentity(identity: CampusIdentity) {
      const member = members.get(identity.id)
      if (member) {
        // Auth refreshes and name changes keep a visitor's assigned colour.
        if (member.preferredColor !== preferredColor(identity)) { member.person.color = assignColor(identity); member.preferredColor = preferredColor(identity) }
        Object.assign(member.person, metadata(identity))
      }
    },
    remove(id: string) { releasePassengers(id, Date.now()); members.delete(id); rideLimits.delete(id) },
    removeMessages(id: string) { for (let i = history.length - 1; i >= 0; i--) if (history[i].sender === id) history.splice(i, 1) },
    pose(id: string, input: unknown, activity: unknown, now = Date.now()) {
      syncRides(now); syncSocial(now)
      const member = members.get(id), pose = parseCampusPose(input)
      if (!member || !pose || !['walk', 'overview', 'football', 'concert'].includes(activity as string) || !pointInRing(localToGps(pose), region) || now - member.poseAt < 70) return false
      const previous = member.person.pose
      if (member.person.social?.action === 'sit') {
        // A client can leave a seat but cannot use a forged pose to relocate it.
        // Stop restores the last accepted standing position with a fresh epoch.
        if (activity !== 'walk' || !pose.visible || !pose.active || pose.space !== 'outdoors' || (pose.vehicle ?? 'walk') !== 'walk') stopSocial(id, now)
        if (member.person.pose) { member.person.pose.active = pose.active; member.person.pose.visible = pose.visible }
        member.person.activity = activity as CampusActivity; member.poseAt = now
        return true
      }
      if (member.person.ride) {
        if (activity !== 'walk' || !pose.visible || pose.space !== 'outdoors' || pose.epoch !== previous?.epoch) release(id, now)
        else {
          // Seat placement comes only from the driver and server seat assignment.
          if ((pose.vehicle ?? 'walk') !== 'walk') return false
          member.poseAt = now; if (member.person.pose) { member.person.pose.active = pose.active; member.person.pose.visible = pose.visible }
          syncRides(now); return true
        }
      }
      const relocated = !previous || previous.epoch !== pose.epoch
      if (relocated && now - member.spawnAt < 1000) return false
      if (previous && !relocated) {
        const elapsed = Math.min(.5, Math.max(0, (now - member.poseAt) / 1000))
        const maximumSpeed = presenceSpeedLimit(pose, activity)
        if (Math.hypot(pose.x - previous.x, pose.z - previous.z) > maximumSpeed * elapsed + .4 || Math.abs(pose.y - previous.y) > 6 * elapsed + .5) return false
      }
      if (previous?.vehicle === 'buggy' && (relocated || pose.vehicle !== 'buggy' || pose.space !== 'outdoors' || !pose.visible || activity !== 'walk')) releasePassengers(id, now)
      if (relocated) member.spawnAt = now
      pose.moving = pose.active && pose.visible && !!previous && !relocated && Math.hypot(pose.x - previous.x, pose.z - previous.z) > .005
      if (member.person.social && (relocated || pose.moving || pose.airborne || !pose.active || !pose.visible && activity !== 'concert' || (pose.vehicle ?? 'walk') !== 'walk' || activity !== member.person.activity || pose.space !== previous?.space || previous && Math.abs(pose.y - previous.y) > .08)) stopSocial(id, now)
      member.person.pose = pose; member.person.activity = activity as CampusActivity; member.poseAt = now
      syncRides(now)
      return true
    },
    social(id: string, action: unknown, seatId?: unknown, now = Date.now()): { ok: true } | { error: string } {
      prune(now); syncRides(now); syncSocial(now)
      const member = members.get(id)
      if (!member) return { error: 'Join the live campus to use social actions.' }
      if (action === 'stop' || action === null) { stopSocial(id, now); return { ok: true } }
      const recent = (socialLimits.get(id) ?? []).filter(time => now - time < 10000)
      if (recent.length >= 8 || recent.length && now - recent.at(-1)! < 650) return { error: 'Give that action a moment before trying another.' }
      if (!socialLimits.has(id) && socialLimits.size >= 4096) return { error: 'Social actions are busy. Try again shortly.' }
      recent.push(now); socialLimits.set(id, recent)
      if (!isSocialAction(action) || action !== 'sit' && seatId !== undefined) return { error: 'Choose one of the campus social actions.' }
      const pose = member.person.pose, activity = member.person.activity
      if (!pose?.active || now - member.poseAt >= 2000 || !pose.visible && activity !== 'concert' || activity === 'football' || (pose.vehicle ?? 'walk') !== 'walk' || member.person.ride || pose.airborne || pose.moving && now - member.poseAt < 500) return { error: 'Stop on foot to use a social action.' }
      if (member.person.social?.action === 'sit') return { error: 'Stand up before starting another action.' }
      if (action === 'sit') {
        const seat = typeof seatId === 'string' ? socialSeats.get(seatId) : undefined
        if (!seat || activity !== 'walk' || pose.space !== 'outdoors' || !pose.visible || Math.hypot(seat.x - pose.x, seat.z - pose.z) > 3.2 || Math.abs(seat.y - pose.y) > .85) return { error: 'Walk closer to an OAT bench to sit down.' }
        if ([...members.values()].some(other => other.person.social?.seatId === seat.id)) return { error: 'Someone is already sitting here. Choose another bench seat.' }
        member.seatOrigin = { ...pose }
        member.person.pose = { ...pose, x: seat.x, y: seat.y, z: seat.z, yaw: seat.yaw, pitch: 0, airborne: false, moving: false, running: false, epoch: nextEpoch(pose.epoch) }
        member.poseAt = now; member.spawnAt = now
      }
      member.person.social = { action, startedAt: now, until: now + SOCIAL_DURATION[action], ...(action === 'sit' ? { seatId: seatId as string } : {}) }
      return { ok: true }
    },
    ride(id: string, driverId: unknown, now = Date.now()): { ok: true } | { error: string } {
      syncRides(now); syncSocial(now)
      const member = members.get(id)
      if (!member) return { error: 'Join the live campus before boarding.' }
      if (now - (rideLimits.get(id) ?? -Infinity) < 250) return { error: 'Give the buggy a moment before trying again.' }
      rideLimits.set(id, now)
      if (driverId === null) {
        if (!member.person.ride) return { error: 'You are not riding in a buggy.' }
        const driver = members.get(member.person.ride.driverId)?.person.pose
        if (driver?.moving) return { error: 'Wait for the driver to stop before getting out.' }
        release(id, now); return { ok: true }
      }
      if (!campusId(driverId) || driverId === id || member.person.ride) return { error: 'Choose another nearby buggy while on foot.' }
      if (member.person.social?.action === 'sit') return { error: 'Stand up before boarding a buggy.' }
      const driver = members.get(driverId), p = driver?.person.pose, own = member.person.pose
      if (!driver || driver.person.ride || driver.person.activity !== 'walk' || !p?.active || !p.visible || p.vehicle !== 'buggy' || p.space !== 'outdoors' || now - driver.poseAt > 2000) return { error: 'That buggy is no longer available.' }
      if (!own?.active || !own.visible || own.space !== 'outdoors' || (own.vehicle ?? 'walk') !== 'walk' || member.person.activity !== 'walk' || now - member.poseAt > 2000 || Math.hypot(own.x - p.x, own.y - p.y, own.z - p.z) > 4) return { error: 'Walk within four metres of the buggy to board.' }
      if (p.moving) return { error: 'Wait for the buggy to stop before boarding.' }
      const occupied = new Set([...members.values()].filter(m => m.person.ride?.driverId === driverId).map(m => m.person.ride!.seat))
      const seat = ([1, 2, 3] as BuggyRide['seat'][]).find(s => !occupied.has(s))
      if (!seat) return { error: 'This buggy is full (four people including the driver).' }
      stopSocial(id, now)
      member.person.ride = { driverId, seat }; member.person.pose = buggySeatPose(p, seat, own.epoch + 1); member.spawnAt = now; member.poseAt = now
      return { ok: true }
    },
    chat(id: string, text: unknown, scope: unknown, now = Date.now()): { message: CampusChat; recipients: string[] } | { error: string } {
      prune(now); syncRides(now); syncSocial(now)
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
      prune(now); syncRides(now); syncSocial(now)
      return { type: 'campus-state', sequence: ++sequence, serverTime: now, people: [...members.values()].map(m => ({ ...m.person, ...(m.person.social ? { social: { ...m.person.social } } : {}), pose: m.person.pose ? { ...m.person.pose, active: m.person.pose.active && now - m.poseAt < 2000, moving: m.person.pose.moving && now - m.poseAt < 500, visible: m.person.pose.visible && now - m.poseAt < 15000 } : null })) }
    },
  }
}
