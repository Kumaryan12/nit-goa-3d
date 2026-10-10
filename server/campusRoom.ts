import { BUGGY_BODY, BUGGY_IMPACT_MS, boundedBuggyVelocity, buggyContact, sweptBuggyContact, solveBuggyImpact } from '../src/lib/buggyImpacts.ts'
import type { BuggyImpact } from '../src/lib/buggyImpacts.ts'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { gpsToLocal, localToGps, pointInRing, validClosedRing } from '../src/lib/geo.ts'
import type { LocalCoordinate } from '../src/lib/geo.ts'
import { allocateAvatarColor, defaultAvatarColor, isAvatarColor, isAvatarStyle } from '../src/lib/profile.ts'
import type { AvatarColor } from '../src/lib/profile.ts'
import { CAMPUS_CAPACITY, campusName, campusHandle, chatText, canHearNearby, parseCampusPose, buggySeatPose, campusId } from '../src/lib/campusProtocol.ts'
import type { CampusPerson, CampusSnapshot, CampusChat, CampusActivity, CampusPose, BuggyRide } from '../src/lib/campusProtocol.ts'
import type { CampusIdentity } from './access.ts'
import { PRESENCE_CATCHUP_SECONDS, presenceSpeedLimit, presenceVerticalSpeedLimit } from '../src/lib/movementLimits.ts'
import { isSocialAction, SOCIAL_DURATION } from '../src/lib/social.ts'
import type { SocialSeat } from '../src/lib/social.ts'
import { createEntranceAccess, inEntranceExterior } from '../src/lib/entranceAccess.ts'

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
  const entranceExterior = createEntranceAccess(boundary)
  const members = new Map<string, { person: CampusPerson; preferredColor: AvatarColor; poseAt: number; spawnAt: number; velocity?: LocalCoordinate; movement?: { horizontal: number; vertical: number; speed: number; verticalSpeed: number }; seatOrigin?: CampusPose }>()
  const rideLimits = new Map<string, number>()
  const socialLimits = new Map<string, number[]>()
  const socialSeats = new Map(seats.map(seat => [seat.id, seat]))
  const chatLimits = new Map<string, number[]>(), history: CampusChat[] = []
  let sequence = 0, impactSequence = 0
  const contacts = new Map<string, { a: string; b: string }>()
  const pendingImpacts: { id: string; impact: BuggyImpact }[] = []
  const preferredColor = (identity: CampusIdentity) => isAvatarColor(identity.avatarColor) ? identity.avatarColor : defaultAvatarColor(identity.id)
  const metadata = (identity: CampusIdentity) => ({ avatarStyle: isAvatarStyle(identity.avatarStyle) ? identity.avatarStyle : 'boy' as const, name: campusName(identity.name), handle: campusHandle(identity.publicHandle) ? identity.publicHandle : null })
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
  const eligibleBuggy = (member: typeof members extends Map<string, infer M> ? M : never, now: number) => {
    const p = member.person.pose
    return !!p && p.vehicle === 'buggy' && p.space === 'outdoors' && p.active && p.visible && member.person.activity === 'walk' && !member.person.ride && now - member.poseAt <= 350 && (!member.person.impact || now >= member.person.impact.until + 500 || p.impactAck === member.person.impact.sequence)
  }
  const resolveImpacts = (id: string, previous: CampusPose, now: number) => {
    const source = members.get(id)!
    if (!eligibleBuggy(source, now)) return
    for (const [key, pair] of contacts) if (members.get(pair.a)?.person.pose?.vehicle !== 'buggy' || members.get(pair.b)?.person.pose?.vehicle !== 'buggy') contacts.delete(key)
    for (const [otherId, other] of members) {
      const a = source.person.pose!, b = other.person.pose
      if (otherId === id || !b || !eligibleBuggy(other, now) || Math.abs(a.y - b.y) > 1.2) continue
      const key = [id, otherId].sort().join(':')
      const contact = buggyContact(a, b)
      if (contact.distance > BUGGY_BODY.radius * 2 + .35) contacts.delete(key)
      if (contacts.has(key)) continue
      const swept = sweptBuggyContact(previous, a, b)
      if (!swept) continue
      const hit = solveBuggyImpact(swept.body, b, source.velocity ?? {x:0,z:0}, other.velocity ?? {x:0,z:0}, swept.normal)
      if (!hit) continue
      contacts.set(key, { a: id, b: otherId })
      const sequence = impactSequence = impactSequence % 1000000000 + 1
      // Rewind only the moving body to its first contact, never push a parked
      // target into unverified terrain. Clients sweep all subsequent recoil
      // against the full campus collision world before publishing it.
      const anchorA = { ...swept.body, y: previous.y + (a.y - previous.y) * swept.t, epoch: a.epoch }
      anchorA.yaw = Math.atan2(Math.sin(anchorA.yaw), Math.cos(anchorA.yaw))
      for (const [driverId, member, anchor, result] of [[id, source, anchorA, hit.a], [otherId, other, {x:b.x,y:b.y,z:b.z,yaw:b.yaw,epoch:b.epoch}, hit.b]] as const) {
        const impact: BuggyImpact = { sequence, startedAt: now, until: now + BUGGY_IMPACT_MS, strength: hit.strength, anchor, ...result }
        member.person.impact = impact; member.person.pose = { ...member.person.pose!, ...anchor, moving: true }
        // Preserve the movement budget: an impact never grants extra travel.
        member.velocity = result.velocity; member.poseAt = now
        for (let i=pendingImpacts.length-1;i>=0;i--) if(pendingImpacts[i].id===driverId) pendingImpacts.splice(i,1)
        pendingImpacts.push({ id: driverId, impact })
      }
      // Resolve at most one new pair for a body per accepted sample. This keeps
      // pileups bounded and avoids contradictory impulses in the same frame.
      break
    }
  }
  return {
    add(identity: CampusIdentity) {
      if (members.size >= CAMPUS_CAPACITY || members.has(identity.id)) return null
      const person: CampusPerson = { id: identity.id, ...metadata(identity), color: assignColor(identity), activity: 'overview', pose: null }
      members.set(identity.id, { person, preferredColor: preferredColor(identity), poseAt: 0, spawnAt: -Infinity }); return person
    },
    locatorVisibility(id: string, visible: unknown): boolean {
      const member = members.get(id)
      if (!member || typeof visible !== 'boolean') return false
      member.person.locatorVisible = visible
      return true
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
    takeImpacts() { return pendingImpacts.splice(0) },
    poseFor(id: string) { const pose = members.get(id)?.person.pose; return pose ? { ...pose } : null },
    removeMessages(id: string) { for (let i = history.length - 1; i >= 0; i--) if (history[i].sender === id) history.splice(i, 1) },
    pose(id: string, input: unknown, activity: unknown, now = Date.now()): boolean {
      return this.updatePose(id, input, activity, now) === 'accepted'
    },
    updatePose(id: string, input: unknown, activity: unknown, now = Date.now()): 'accepted' | 'throttled' | 'invalid' {
      syncRides(now); syncSocial(now)
      const member = members.get(id), pose = parseCampusPose(input)
      if (!member || !pose || !['walk', 'overview', 'football', 'concert'].includes(activity as string) || !(pointInRing(localToGps(pose), region) || entranceExterior && inEntranceExterior(pose,entranceExterior))) return 'invalid'
      const throttled = now - member.poseAt < 70
      const previous = member.person.pose
      const impact = member.person.impact
      // Old in-flight packets cannot undo a server impact before its owner has
      // applied it. No client message can create or increase an impulse.
      if (impact && now < impact.until + 500 && pose.vehicle === 'buggy' && pose.epoch === impact.anchor.epoch && pose.impactAck !== impact.sequence) return 'throttled'
      if (member.person.social?.action === 'sit') {
        if (throttled) return 'throttled'
        // A client can leave a seat but cannot use a forged pose to relocate it.
        // Stop restores the last accepted standing position with a fresh epoch.
        if (activity !== 'walk' || !pose.visible || !pose.active || pose.space !== 'outdoors' || (pose.vehicle ?? 'walk') !== 'walk') stopSocial(id, now)
        if (member.person.pose) { member.person.pose.active = pose.active; member.person.pose.visible = pose.visible }
        member.person.activity = activity as CampusActivity; member.poseAt = now
        return 'accepted'
      }
      if (member.person.ride) {
        // A walking heartbeat may already be in flight when the server assigns
        // the next seat epoch. It must not undo a successful boarding request.
        if (previous && pose.epoch < previous.epoch && activity === 'walk' && pose.visible && pose.space === 'outdoors') return 'throttled'
        if (throttled) return 'throttled'
        if (activity !== 'walk' || !pose.visible || pose.space !== 'outdoors' || pose.epoch !== previous?.epoch) release(id, now)
        else {
          // Seat placement comes only from the driver and server seat assignment.
          if ((pose.vehicle ?? 'walk') !== 'walk') return 'invalid'
          member.poseAt = now; if (member.person.pose) { member.person.pose.active = pose.active; member.person.pose.visible = pose.visible }
          syncRides(now); return 'accepted'
        }
      }
      const relocated = !previous || previous.epoch !== pose.epoch
      if (relocated && now - member.spawnAt < 1000) return 'invalid'
      const maximumSpeed = presenceSpeedLimit(pose, activity), verticalSpeed = presenceVerticalSpeedLimit(pose, activity)
      let movement = { horizontal: .4, vertical: .5, speed: maximumSpeed, verticalSpeed }
      if (previous && !relocated) {
        const elapsed = Math.min(PRESENCE_CATCHUP_SECONDS, Math.max(0, (now - member.poseAt) / 1000))
        const budget = member.movement?.speed === maximumSpeed && member.movement.verticalSpeed === verticalSpeed ? member.movement : movement
        // Arrival intervals are not simulation intervals: delayed packets can
        // drain in a burst. Carry unused travel allowance across accepted poses,
        // capped at the same two-second catch-up window. Spend it only on valid
        // poses; do not grant a fresh tolerance on every packet.
        const horizontal = Math.min(maximumSpeed * PRESENCE_CATCHUP_SECONDS + .4, budget.horizontal + maximumSpeed * elapsed)
        const vertical = Math.min(verticalSpeed * PRESENCE_CATCHUP_SECONDS + .5, budget.vertical + verticalSpeed * elapsed)
        const distance = Math.hypot(pose.x - previous.x, pose.z - previous.z), rise = Math.abs(pose.y - previous.y)
        if (distance > horizontal + 1e-8 || rise > vertical + 1e-8) return 'invalid'
        movement = { horizontal: Math.max(0, horizontal - distance), vertical: Math.max(0, vertical - rise), speed: maximumSpeed, verticalSpeed }
      }
      if (throttled) return 'throttled'
      member.movement = movement
      if (previous?.vehicle === 'buggy' && (relocated || pose.vehicle !== 'buggy' || pose.space !== 'outdoors' || !pose.visible || activity !== 'walk')) releasePassengers(id, now)
      if (relocated) member.spawnAt = now
      pose.moving = pose.active && pose.visible && !!previous && !relocated && Math.hypot(pose.x - previous.x, pose.z - previous.z) > .005
      if (member.person.social && (relocated || pose.moving || pose.airborne || !pose.active || !pose.visible && activity !== 'concert' || (pose.vehicle ?? 'walk') !== 'walk' || activity !== member.person.activity || pose.space !== previous?.space || previous && Math.abs(pose.y - previous.y) > .08)) stopSocial(id, now)
      const elapsed = Math.max(.07, (now - member.poseAt) / 1000)
      member.velocity = previous && !relocated ? boundedBuggyVelocity({x:(pose.x-previous.x)/elapsed,z:(pose.z-previous.z)/elapsed}) : {x:0,z:0}
      if (relocated || pose.vehicle !== 'buggy') delete member.person.impact
      member.person.pose = pose; member.person.activity = activity as CampusActivity; member.poseAt = now
      if (previous && !relocated && pose.vehicle === 'buggy') resolveImpacts(id, previous, now)
      syncRides(now)
      return 'accepted'
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
      if (!driver || driver.person.ride || driver.person.activity !== 'walk' || !p || !p.visible || p.vehicle !== 'buggy' || p.space !== 'outdoors' || now - driver.poseAt > 2000) return { error: 'That buggy is no longer available.' }
      if (!own?.active || !own.visible || own.airborne || own.space !== 'outdoors' || (own.vehicle ?? 'walk') !== 'walk' || member.person.activity !== 'walk' || now - member.poseAt > 2000 || Math.hypot(own.x - p.x, own.y - p.y, own.z - p.z) > 4) return { error: 'Walk within four metres of the buggy to board.' }
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
      return { type: 'campus-state', sequence: ++sequence, serverTime: now, people: [...members.values()].map(m => { const { impact, ...person } = m.person; return ({ ...person, ...(impact && impact.until > now && m.person.pose?.epoch === impact.anchor.epoch && m.person.pose.vehicle === 'buggy' ? { impact } : {}), ...(m.person.social ? { social: { ...m.person.social } } : {}), pose: m.person.pose ? { ...m.person.pose, active: m.person.pose.active && now - m.poseAt < 2000, moving: m.person.pose.moving && now - m.poseAt < 500, visible: m.person.pose.visible && now - m.poseAt < 15000 } : null }) }) }
    },
  }
}
