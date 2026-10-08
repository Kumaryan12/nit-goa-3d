import type { AvatarStyle } from '../lib/profile'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Group } from 'three'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { LocalCoordinate } from '../lib/geo'
import { cameraBoomFraction, createWalkWorld, emptyWalkInput, findSharedSpawn, isWalkable, nearestWalkLocation, stepWalking, treeCeilingAt, walkSurfaceHeightAt } from '../lib/walking'
import { arrivalFacing, findLocationArrival } from '../lib/walkArrival'
import type { WalkInput, WalkSpawnRequest, WalkStatus } from '../lib/walking'
import { footballToLocal, footballToWorld } from '../lib/football'
import type { FootballControls, FootballPitch } from '../lib/football'
import StudentAvatar from './StudentAvatar'
import SocialBubble from './SocialBubble'
import CampusVehicle from './CampusVehicle'
import { advanceVehicle, findVehicleMount, findVehicleDismount, freshVehicle, vehicleGroundPose } from '../lib/vehicles'
import type { TransportMode } from '../lib/vehicles'
import { advanceLocomotion, freshLocomotion, motionDelta, reconcileLocomotion, stridePhase } from '../lib/avatarMotion'
import { advanceJump, freshJump } from '../lib/avatarJump'
import type { AvatarMotion } from '../lib/avatarMotion'
import { cameraWheelStep, smoothLookAngle, walkSpeed, WALK_CONTROLS } from '../lib/walkControls'
import { bindCameraGestures } from '../lib/cameraGestures'
import { PRESENCE_SPEED_LIMITS } from '../lib/movementLimits'
import type { CampusPose, CampusSession } from '../lib/campusProtocol'
import { canUseStairs, interiorFloorPlan, interiorLocationId, interiorRoomLabel, interiorSpace, interiorCameraFraction, interiorJumpCeiling, isInteriorWalkable, landingLookDirection, pointDistance, roomAtPoint, stairLanding, stairSample, stepInterior } from '../lib/hostelInterior'
import type { HostelAction, HostelPlan, InteriorPose, StairJourney } from '../lib/hostelInterior'

const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
const editingText = () => { const element = document.activeElement; return element instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable) }
export default function AvatarExplorer({ avatarStyle, campusSession, onSocialStop, onBuggyRide, campusPose, footballPitch, footballControls, footballLive, footballJersey, avatarAccent, hostelPlan, gyanPlan, interiorPose, processedSpawn, twin, paused, input, position, spawn, onStatus, onInspect }: {
  avatarStyle?: AvatarStyle
  onSocialStop: () => void
  campusSession: React.RefObject<CampusSession>; onBuggyRide: (driverId: string | null) => void
  campusPose: React.RefObject<CampusPose | null>
  footballPitch: FootballPitch | null; footballControls: React.RefObject<FootballControls>; footballLive: boolean; footballJersey?: string; avatarAccent?: string
  hostelPlan: HostelPlan | null; gyanPlan: HostelPlan | null; interiorPose: React.RefObject<InteriorPose | null>
  processedSpawn: React.RefObject<number>
  twin: DigitalTwin; paused: boolean; input: React.RefObject<WalkInput>; position: React.RefObject<LocalCoordinate | null>; spawn: WalkSpawnRequest;
  onStatus: (status: WalkStatus) => void; onInspect: (id: string) => void
}) {
  const [passengerView, setPassengerView] = useState(false), ridingPassenger = useRef(false)
  const seated = useRef(false), stoppingSocial = useRef<number | null>(null)
  const seatOrigin = useRef<CampusPose | null>(null)
  const seatEpoch = useRef(0)
  const [rideMode, setRideMode] = useState<TransportMode>('walk')
  const ride = useRef<TransportMode>('walk'), vehicle = useRef(freshVehicle()), rideMessage = useRef<string | undefined>(undefined)
  const jump = useRef(freshJump())
  const journey = useRef<StairJourney | null>(null), actionContext = useRef<WalkStatus | null>(null)
  const campusEpoch = useRef((campusPose.current?.epoch ?? 0) + 1)
  const joinedId = useRef<string | null>(null)
  const { gl, camera } = useThree(), avatar = useRef<Group>(null), yaw = useRef(0), pitch = useRef(0.28), cameraDistance = useRef(7)
  const lookTarget = useRef({ yaw: 0, pitch: .28, distance: 7 })
  const keys = useRef(new Set<string>()), motion = useRef<AvatarMotion>({ phase: 0, moving: false, speed: 0, running: false }), locomotion = useRef(freshLocomotion()), elapsed = useRef(0), nearest = useRef<string | null>(null)
  const world = useMemo(() => createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps), [twin])
  const locations = useMemo(() => [...twin.locations, ...twin.selections.filter(item => item.matchMethod === 'unmatched').map(item => item.location)].map(location => ({ ...location, osmBuildingId: twin.selections.find(item => item.location.id === location.id)?.buildingId ?? location.osmBuildingId })), [twin])
  const arrival = useMemo(() => {
    const location = locations.find(item => item.id === spawn.locationId) ?? locations.find(item => item.id === 'main-entrance')!
    return findLocationArrival(location, twin, world, [hostelPlan, gyanPlan])
  }, [locations, spawn.locationId, twin, world, hostelPlan, gyanPlan])
  const activePlan = useCallback(() => {const pose=interiorPose.current, plan=pose?.buildingId===gyanPlan?.buildingId?gyanPlan:hostelPlan;return plan&&pose?interiorFloorPlan(plan,pose.floor):plan},[gyanPlan,hostelPlan,interiorPose])
  const target = useMemo(() => new Vector3(), []), desired = useMemo(() => new Vector3(), []), snapped = useRef(false), oriented = useRef(false)
  const publish = useCallback((moving = false, blocked = false, error?: string) => {
    const p = position.current; if (!p) return
    const activity = campusSession.current.snapshot?.people.find(p => p.id === campusSession.current.id)?.activity
    const activityBlocked = activity === 'concert' || activity === 'football'
    const plan=activePlan(), pose = interiorPose.current, place = pose && plan ? { id: interiorLocationId(plan), distance: 0 } : nearestWalkLocation(p, locations, world)
    nearest.current = place && place.distance <= 25 ? place.id : null
    const room = pose && plan ? roomAtPoint(plan, p) : null
    const status: WalkStatus = {
      position: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }, nearestId: nearest.current, distance: place?.distance ?? Infinity, moving, blocked, error, vehicle: ride.current, speed: ridingPassenger.current ? motion.current.speed : Math.abs(vehicle.current.speed), rideMessage: rideMessage.current, canRide: !seated.current && !activityBlocked && !ridingPassenger.current && !pose && !footballPitch && jump.current.grounded, canJump: !seated.current && !ridingPassenger.current && ride.current === 'walk' && jump.current.grounded && !journey.current,
      canEnterHostel: !ridingPassenger.current && ride.current === 'walk' && jump.current.grounded && !pose && !!hostelPlan && pointDistance(p, hostelPlan.entrance.outside) <= 5,
      canEnterGyan: !ridingPassenger.current && ride.current === 'walk' && jump.current.grounded && !pose && !!gyanPlan && pointDistance(p, gyanPlan.entrance.outside) <= 5,
      interior: pose && plan ? { kind: plan.kind, name: plan.name, levels: plan.levels, floor: pose.floor, room: room ? interiorRoomLabel(plan, pose.floor, room.id) : null, canGoUp: jump.current.grounded && !journey.current && canUseStairs(plan, p, pose.floor, true), canGoDown: jump.current.grounded && !journey.current && canUseStairs(plan, p, pose.floor, false), stairLowFloor: journey.current?.lowFloor ?? null } : undefined,
    }
    actionContext.current = status; onStatus(status)
  }, [hostelPlan, gyanPlan, activePlan, interiorPose, position, locations, world, onStatus, footballPitch, campusSession])
  useEffect(() => {
    const anchor = locations.find(location => location.id === spawn.locationId) ?? twin.locations.find(location => location.id === 'main-entrance')!
    const changed = processedSpawn.current !== spawn.sequence, pose = interiorPose.current, plan = activePlan()
    const validInside = !!plan && !!pose && pose.buildingId === plan.buildingId && pose.floor >= 0 && pose.floor < plan.levels && !!position.current && isInteriorWalkable(position.current, plan)
    const relocating = changed || !position.current || !(validInside || isWalkable(position.current, world))
    if (relocating) {
      interiorPose.current = null
      if (hostelPlan && spawn.enterHostel) { interiorPose.current = { buildingId: hostelPlan.buildingId, floor: 0 }; position.current = { ...hostelPlan.entrance.inside } }
      else if (gyanPlan && spawn.enterGyan) { interiorPose.current = { buildingId: gyanPlan.buildingId, floor: 0 }; position.current = { ...gyanPlan.entrance.inside } }
      else if (spawn.football && footballPitch) position.current = footballToWorld({ x:-1.4,z:0 }, footballPitch)
      else {
        position.current = arrival ? { ...arrival.position } : null
        const live = campusSession.current
        if (position.current && live.id && arrival?.entrance) {
          const occupied = live.snapshot?.people.filter(person => person.id !== live.id && person.pose?.visible && person.pose.space === 'outdoors').map(person => person.pose!) ?? []
          if (live.spawnPending || occupied.some(other => Math.hypot(other.x - position.current!.x, other.z - position.current!.z) < 1.5)) position.current = findSharedSpawn(position.current, world, live.spawnSlot ?? 0, occupied, arrival.entrance)
        }
      }
    } else if (pose && !validInside) interiorPose.current = null
    // Geometry/metadata refreshes must not reset a moving vehicle or held keys.
    if (!relocating && oriented.current) return
    // Switching modes during a stair walk returns to a safe same-floor landing.
    if (validInside && position.current && plan && pointDistance(position.current, plan.stairs.start) + pointDistance(position.current, plan.stairs.end) < plan.stairs.length + .3) position.current = stairLanding(plan, pose!.floor < plan.levels - 1)
    ride.current = 'walk'; setRideMode('walk'); vehicle.current = freshVehicle(); rideMessage.current = undefined
    journey.current = null; jump.current = freshJump(); campusEpoch.current++; locomotion.current = freshLocomotion(); motion.current = { phase: 0, moving: false, speed: 0, running: false }; processedSpawn.current = spawn.sequence
    if (avatar.current) avatar.current.visible = !!position.current
    nearest.current = null
    if (!position.current) onStatus({ position: anchor.coordinates, nearestId: null, distance: Infinity, moving: false, blocked: false, error: `The entrance to ${anchor.name} is blocked. Choose another starting place.` })
    else {
      if (relocating || !oriented.current) {
        const points = world.buildings.length ? world.buildings.map(building => ({ x: (building.minX + building.maxX) / 2, z: (building.minZ + building.maxZ) / 2 })) : twin.boundary
        const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, z: sum.z + point.z / points.length }), { x: 0, z: 0 })
        yaw.current = arrival ? spawn.locationId === 'main-entrance' ? arrival.yaw : arrivalFacing(position.current, arrival) : Math.atan2(position.current.x - center.x, position.current.z - center.z)
        if (spawn.football && footballPitch) yaw.current = Math.atan2(-Math.cos(footballPitch.rotation), Math.sin(footballPitch.rotation))
        if (interiorPose.current && arrival?.entrance) yaw.current = Math.atan2(arrival.entrance.outward.x, arrival.entrance.outward.z)
        if (avatar.current) avatar.current.rotation.y = yaw.current
        oriented.current = true
      }
      publish()
    }
    if (relocating) { gl.domElement.tabIndex = 0; gl.domElement.focus({ preventScroll: true }) }
    lookTarget.current = { yaw: yaw.current, pitch: pitch.current, distance: cameraDistance.current }
    snapped.current = false; keys.current.clear(); input.current = emptyWalkInput()
  }, [world, spawn, locations, twin, input, position, interiorPose, processedSpawn, hostelPlan, gyanPlan, activePlan, onStatus, publish, footballPitch, gl, arrival])
  const act = useCallback((action: HostelAction) => {
    const plan = action==='enter-gyan'?gyanPlan:action==='enter-hostel'?hostelPlan:activePlan(), p = position.current, pose = interiorPose.current
    if (ridingPassenger.current || ride.current !== 'walk' || !plan || !p || journey.current || !jump.current.grounded) return
    if ((action === 'enter-hostel'||action==='enter-gyan') && !pose && pointDistance(p, plan.entrance.outside) <= 5) {
      interiorPose.current = { buildingId: plan.buildingId, floor: 0 }; position.current = { ...plan.entrance.inside }
      yaw.current = Math.atan2(-plan.entrance.inward.x, -plan.entrance.inward.z)
    } else if (action === 'exit-hostel' && pose) {
      interiorPose.current = null; position.current = { ...plan.entrance.outside }
      yaw.current = Math.atan2(plan.entrance.inward.x, plan.entrance.inward.z)
    } else if(action==='find-reading-room' && pose && plan.readingRoom) {
      position.current={x:plan.readingRoom.door.x+plan.readingRoom.inward.x*1.2,z:plan.readingRoom.door.z+plan.readingRoom.inward.z*1.2};yaw.current=Math.atan2(plan.readingRoom.inward.x,plan.readingRoom.inward.z)
    } else if (action === 'find-stairs' && pose) {
      const up = pose.floor < plan.levels - 1; position.current = stairLanding(plan, up)
      yaw.current = Math.atan2(plan.stairs.along.x * (up ? -1 : 1), plan.stairs.along.z * (up ? -1 : 1))
    } else if (pose && (action === 'stairs-up' || action === 'stairs-down')) {
      const up = action === 'stairs-up'; if (!canUseStairs(plan, p, pose.floor, up)) return
      journey.current = { lowFloor: up ? pose.floor : pose.floor - 1, up, progress: 0 }
      position.current = stairLanding(plan, up); yaw.current = Math.atan2(plan.stairs.along.x * (up ? -1 : 1), plan.stairs.along.z * (up ? -1 : 1))
    } else return
    if (avatar.current) avatar.current.rotation.y = yaw.current
    lookTarget.current.yaw = yaw.current
    campusEpoch.current++
    keys.current.clear(); input.current = emptyWalkInput(); jump.current = freshJump(); locomotion.current = freshLocomotion(); snapped.current = false; gl.domElement.tabIndex = 0; gl.domElement.focus({ preventScroll: true }); publish()
  }, [gl, hostelPlan, gyanPlan, activePlan, position, interiorPose, input, publish])
  useEffect(() => {
    const fov = camera instanceof Object && 'fov' in camera ? camera.fov : null, near = camera.near
    camera.near = 0.1; if ('fov' in camera) camera.fov = 60; camera.updateProjectionMatrix()
    return () => { camera.near = near; if ('fov' in camera && typeof fov === 'number') camera.fov = fov; camera.updateProjectionMatrix() }
  }, [camera])
  useEffect(() => () => { keys.current.clear(); input.current = emptyWalkInput(); vehicle.current.speed = 0; locomotion.current = freshLocomotion() }, [input])
  useEffect(() => {
    const clear = () => { keys.current.clear(); input.current = emptyWalkInput(); locomotion.current = freshLocomotion(); vehicle.current.speed = 0; lookTarget.current = { yaw: yaw.current, pitch: pitch.current, distance: cameraDistance.current } }
    if (paused) clear()
    const down = (event: KeyboardEvent) => {
      if (paused || editingText() || event.metaKey || event.ctrlKey || event.altKey) return
      if (movementKeys.has(event.code)) { event.preventDefault(); keys.current.add(event.code) }
      if ((event.code === 'Space' || event.code === 'KeyJ') && !(event.code === 'Space' && event.target instanceof HTMLElement && event.target.closest('button'))) {
        event.preventDefault()
        if (!event.repeat) {
          if (ride.current !== 'walk') { if (event.code === 'Space') keys.current.add('Space') }
          else if (event.code === 'Space' && footballPitch && footballLive) footballControls.current.kick++
          else input.current.jump = true
        }
      }
      if (event.code === 'KeyF' && !event.repeat) {
        if (ridingPassenger.current) { event.preventDefault(); onBuggyRide(null) }
        else if (ride.current !== 'walk') { event.preventDefault(); input.current.vehicle = 'walk' }
      }
      if (event.code === 'KeyE' && !event.repeat) {
        event.preventDefault(); clear()
        const context = actionContext.current
        if (context?.canEnterHostel) act('enter-hostel')
        else if (context?.canEnterGyan) act('enter-gyan')
        else if (context?.interior?.canGoUp) act('stairs-up')
        else if (context?.interior?.canGoDown) act('stairs-down')
        else if (interiorPose.current?.floor === 0 && activePlan() && position.current && pointDistance(position.current, activePlan()!.entrance.inside) < 3) act('exit-hostel')
        else if (nearest.current) onInspect(nearest.current)
      }
      if (event.code === 'Escape') clear()
    }
    const up = (event: KeyboardEvent) => { keys.current.delete(event.code) }
    const hidden = () => { if (document.hidden) clear() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', hidden) }
  }, [paused, input, onInspect, act, activePlan, interiorPose, position, footballPitch, footballLive, footballControls, onBuggyRide])
  useEffect(() => {
    if (paused) return
    const distance = (value: number) => { lookTarget.current.distance = Math.max(3, Math.min(12, value)) }
    return bindCameraGestures(gl.domElement, {
      zoom: ratio => distance(lookTarget.current.distance * ratio),
      rotate: (x, y) => { lookTarget.current.yaw -= x * WALK_CONTROLS.dragYaw; lookTarget.current.pitch = Math.max(.08, Math.min(.8, lookTarget.current.pitch + y * WALK_CONTROLS.dragPitch)) },
      scroll: event => distance(lookTarget.current.distance + cameraWheelStep(event.deltaY, event.deltaMode)),
    })
  }, [gl, paused])
  useFrame((_, delta) => {
    if (!avatar.current || !position.current) return
    delta = motionDelta(delta)
    const live = campusSession.current
    if (live.id && live.spawnPending) {
      if (joinedId.current !== live.id && !interiorPose.current && !footballPitch && ride.current === 'walk' && !seated.current && !ridingPassenger.current) {
        const occupied = live.snapshot?.people.filter(person => person.id !== live.id && person.pose?.visible && person.pose.space === 'outdoors').map(person => person.pose!) ?? []
        position.current = findSharedSpawn(arrival?.position ?? position.current, world, live.spawnSlot ?? 0, occupied, arrival?.entrance)
        if (arrival && spawn.locationId !== 'main-entrance') yaw.current = arrivalFacing(position.current, arrival)
        lookTarget.current.yaw = yaw.current; avatar.current.rotation.y = yaw.current
        campusEpoch.current++; snapped.current = false; locomotion.current = freshLocomotion()
      }
      joinedId.current = live.id; live.spawnPending = false
    }
    const correction = campusSession.current.correction
    if (correction) {
      delete campusSession.current.correction
      // Ignore feedback for an older spawn after a view/floor change.
      if (correction.epoch === campusEpoch.current && !seated.current && !ridingPassenger.current) {
        position.current = { x: correction.x, z: correction.z }; avatar.current.position.set(correction.x, correction.y, correction.z)
        avatar.current.rotation.set(correction.pitch ?? 0, correction.yaw, 0)
        yaw.current = correction.yaw; lookTarget.current.yaw = correction.yaw
        vehicle.current.yaw = correction.yaw; vehicle.current.speed = 0
        locomotion.current = freshLocomotion(); jump.current = freshJump(); snapped.current = false
      }
    }
    const self = campusSession.current.snapshot?.people.find(p => p.id === campusSession.current.id)
    const social = self?.social && self.social.until > Date.now() ? self.social : undefined
    const sitting = social?.action === 'sit' ? self?.pose : null
    if (!!sitting !== seated.current) {
      const wasSeated = seated.current; seated.current = !!sitting
      locomotion.current = freshLocomotion(); jump.current = freshJump()
      if (sitting) {
        seatOrigin.current = { x: position.current.x, z: position.current.z, y: avatar.current.position.y, yaw: avatar.current.rotation.y, vehicle: 'walk', moving: false, running: false, active: true, visible: true, space: 'outdoors', epoch: campusEpoch.current }
        seatEpoch.current = sitting.epoch
      }
      const restored = sitting ?? (wasSeated ? self?.pose && self.pose.epoch > seatEpoch.current ? self.pose : seatOrigin.current : null)
      if (restored) {
        position.current = { x: restored.x, z: restored.z }; avatar.current.position.set(restored.x, restored.y, restored.z)
        avatar.current.rotation.set(0, restored.yaw, 0); campusEpoch.current = Math.max(campusEpoch.current, restored.epoch, wasSeated ? campusEpoch.current + 1 : 0)
        if (sitting) { yaw.current = restored.yaw; lookTarget.current.yaw = restored.yaw; keys.current.clear(); input.current = emptyWalkInput() }
      }
      if (wasSeated) seatOrigin.current = null
      stoppingSocial.current = null; publish()
    }
    motion.current.social = social
    const activityBlocked = self?.activity === 'concert' || self?.activity === 'football'
    if (activityBlocked && ride.current !== 'walk') {
      position.current = findVehicleDismount(position.current, vehicle.current.yaw, ride.current, world) ?? position.current
      ride.current = 'walk'; setRideMode('walk'); vehicle.current.speed = 0; jump.current = freshJump(); locomotion.current = freshLocomotion()
    }
    const passengerPose = self?.ride ? self.pose : null
    if (!!passengerPose !== ridingPassenger.current) {
      const wasPassenger = ridingPassenger.current
      ridingPassenger.current = !!passengerPose; setPassengerView(!!passengerPose)
      keys.current.clear(); input.current = emptyWalkInput(); jump.current = freshJump(); locomotion.current = freshLocomotion(); vehicle.current.speed = 0
      ride.current = 'walk'; setRideMode('walk')
      if (passengerPose) {
        position.current = { x: passengerPose.x, z: passengerPose.z }; avatar.current.rotation.y = passengerPose.yaw
      } else if (wasPassenger) {
        const p = self?.pose ?? position.current
        position.current = findVehicleDismount(p, avatar.current.rotation.y, 'buggy', world) ?? { x: p.x, z: p.z }
      }
      if (self?.pose) campusEpoch.current = Math.max(campusEpoch.current, self.pose.epoch)
      publish()
    }
    const allowed = !paused && !editingText() && !document.hidden, key = (code: string) => allowed && keys.current.has(code) ? 1 : 0
    let forward = allowed ? key('KeyW') + key('ArrowUp') - key('KeyS') - key('ArrowDown') + input.current.forward : 0
    let side = allowed ? key('KeyD') - key('KeyA') + input.current.side : 0
    const turn = allowed ? key('ArrowLeft') - key('ArrowRight') + input.current.turn : 0
    if (allowed && social && (forward || side || input.current.jump || input.current.action || input.current.vehicle) && stoppingSocial.current !== social.startedAt) { stoppingSocial.current = social.startedAt; onSocialStop() }
    if (sitting) { forward = 0; side = 0; delete input.current.jump; delete input.current.action; delete input.current.vehicle }
    if (allowed) {
      const rotation = (ride.current === 'walk' ? Math.max(-1, Math.min(1, turn)) : 0) * delta * WALK_CONTROLS.turnSpeed
      yaw.current += rotation; lookTarget.current.yaw += rotation
      yaw.current = smoothLookAngle(yaw.current, lookTarget.current.yaw, delta)
      const blend = 1 - Math.exp(-delta * 12)
      pitch.current += (lookTarget.current.pitch - pitch.current) * blend
      cameraDistance.current += (lookTarget.current.distance - cameraDistance.current) * blend
    } else lookTarget.current = { yaw: yaw.current, pitch: pitch.current, distance: cameraDistance.current }
    const direction = { x: -Math.sin(yaw.current) * forward + Math.cos(yaw.current) * side, z: -Math.cos(yaw.current) * forward - Math.sin(yaw.current) * side }
    if (input.current.action) { const action = input.current.action; delete input.current.action; if (allowed) act(action) }
    const requestedJump = !!input.current.jump; delete input.current.jump
    if (input.current.vehicle) {
      const requested = input.current.vehicle; delete input.current.vehicle
      if (allowed && !ridingPassenger.current && requested !== ride.current) {
        rideMessage.current = undefined
        if (requested === 'walk' && ride.current !== 'walk') {
          const dismount = findVehicleDismount(position.current, vehicle.current.yaw, ride.current, world)
          if (dismount) { position.current = dismount; ride.current = 'walk'; setRideMode('walk'); vehicle.current.speed = 0; locomotion.current = freshLocomotion(); jump.current = freshJump(); campusEpoch.current++ }
          else rideMessage.current = 'Move to open space before dismounting.'
        } else if (requested !== 'walk' && !activityBlocked && !interiorPose.current && !footballPitch && jump.current.grounded) {
          const mount = findVehicleMount(position.current, avatar.current.rotation.y, requested, world, twin.roads)
          if (mount) { position.current = mount.point; ride.current = requested; setRideMode(requested); vehicle.current = freshVehicle(mount.yaw); avatar.current.rotation.y = mount.yaw; yaw.current = mount.yaw; lookTarget.current.yaw = mount.yaw; jump.current = freshJump(); locomotion.current = freshLocomotion(); campusEpoch.current++ }
          else rideMessage.current = 'Move to open ground with enough space for the vehicle.'
        } else rideMessage.current = 'Vehicles are available outdoors, outside football, while standing on the ground.'
        if (ride.current === requested && !rideMessage.current) { gl.domElement.tabIndex = 0; gl.domElement.focus({ preventScroll: true }) }
        publish()
      }
    }
    const before = position.current, pose = interiorPose.current, plan = activePlan()
    // Room admission can relocate a football player between render frames.
    if (!passengerPose && Math.hypot(before.x - avatar.current.position.x, before.z - avatar.current.position.z) > 2) { campusEpoch.current++; jump.current = freshJump() }
    const running = !!(allowed && !sitting && (key('ShiftLeft') || key('ShiftRight') || input.current.running))
    const travel = advanceLocomotion(locomotion.current, direction, walkSpeed(running, !!pose), delta, allowed && !journey.current && !passengerPose && !sitting)
    let vehicleBlocked = false
    let next = before, surfaceY = walkSurfaceHeightAt(twin.terrain, before.x, before.z)
    if (sitting) {
      next = { x: sitting.x, z: sitting.z }; surfaceY = sitting.y
      avatar.current.rotation.set(0, sitting.yaw, 0); jump.current = freshJump()
    } else if (passengerPose) {
      const blend = 1 - Math.exp(-delta * 15)
      next = { x: before.x + (passengerPose.x - before.x) * blend, z: before.z + (passengerPose.z - before.z) * blend }
      surfaceY = avatar.current.position.y + (passengerPose.y - avatar.current.position.y) * blend
      avatar.current.rotation.order = 'YXZ'
      avatar.current.rotation.x += ((passengerPose.pitch ?? 0) - avatar.current.rotation.x) * blend
      avatar.current.rotation.y += Math.atan2(Math.sin(passengerPose.yaw - avatar.current.rotation.y), Math.cos(passengerPose.yaw - avatar.current.rotation.y)) * blend
      yaw.current += Math.atan2(Math.sin(passengerPose.yaw - yaw.current), Math.cos(passengerPose.yaw - yaw.current)) * (1 - Math.exp(-delta * 3)); lookTarget.current.yaw = yaw.current
    } else if (ride.current !== 'walk') {
      const result = advanceVehicle(vehicle.current, before, ride.current, forward, side - turn, !!input.current.brake || !!key('Space'), delta, world, twin.roads, allowed)
      next = result.point; vehicleBlocked = result.blocked
      const ground = vehicleGroundPose(next, vehicle.current.yaw, ride.current, world, twin.roads, -vehicle.current.steering)
      surfaceY = ground.y
      avatar.current.rotation.order = 'YXZ'
      avatar.current.rotation.y = vehicle.current.yaw
      const difference = Math.atan2(Math.sin(vehicle.current.yaw - yaw.current), Math.cos(vehicle.current.yaw - yaw.current))
      yaw.current += difference * (1 - Math.exp(-delta * 3)); lookTarget.current.yaw = yaw.current
      avatar.current.rotation.x = ground.pitch
    } else if (pose && plan) {
      avatar.current.rotation.x = 0
      surfaceY = plan.base + pose.floor * plan.floorHeight + .14
      if (journey.current) {
        jump.current = freshJump()
        if (allowed) journey.current.progress += Math.min(delta, .1) / 3.4
        const sample = stairSample(plan, journey.current); next = sample.point; surfaceY = sample.y
        if (sample.complete) {
          pose.floor = sample.floor; journey.current = null; position.current = next
          const look = landingLookDirection(plan, next); yaw.current = Math.atan2(-look.x,-look.z)
          lookTarget.current.yaw = yaw.current
          avatar.current.rotation.y = yaw.current; snapped.current = false; publish()
        }
      } else next = stepInterior(before, travel.direction, travel.speed, travel.delta, plan, jump.current.grounded ? undefined : jump.current.y ?? undefined, pose.floor)
    } else {
      avatar.current.rotation.x = 0
      next = stepWalking(before, travel.direction, travel.speed, travel.delta, world, jump.current.grounded ? undefined : jump.current.y ?? undefined)
      surfaceY = walkSurfaceHeightAt(twin.terrain, next.x, next.z)
    }
    if (footballPitch && !pose) { const local = footballToLocal(next, footballPitch); next = footballToWorld({ x:Math.max(-44,Math.min(44,local.x)), z:Math.max(-24,Math.min(24,local.z)) }, footballPitch); surfaceY = footballPitch.elevation + .11 }
    if (!sitting && !journey.current && !passengerPose && ride.current === 'walk') advanceJump(jump.current, surfaceY, delta, requestedJump, allowed, pose && plan ? interiorJumpCeiling(plan, next, pose.floor) : treeCeilingAt(next, world))
    const feetY = sitting || passengerPose || journey.current || ride.current !== 'walk' ? surfaceY : jump.current.y ?? surfaceY
    reconcileLocomotion(locomotion.current, before, next, travel)
    const moved = Math.hypot(next.x - before.x, next.z - before.z), blocked = !passengerPose && (vehicleBlocked || ride.current === 'walk' && allowed && !sitting && travel.speed * travel.delta > .00001 && moved < travel.speed * travel.delta * .05 && !journey.current)
    footballControls.current.actor = footballPitch ? { position:{...next}, direction:{x:-Math.sin(yaw.current),z:-Math.cos(yaw.current)}, moving:moved>.001, running, active:allowed && footballLive && !pose } : null
    position.current = next
    motion.current.moving = moved > .001
    motion.current.speed = delta > 0 ? Math.min(PRESENCE_SPEED_LIMITS[passengerPose ? 'buggy' : ride.current], moved / delta) : 0
    motion.current.driveSpeed = vehicle.current.speed
    motion.current.vehicle = passengerPose ? 'buggy' : ride.current
    motion.current.running = !passengerPose && ride.current === 'walk' && running
    motion.current.paused = !allowed
    motion.current.airborne = !jump.current.grounded
    motion.current.phase = stridePhase(motion.current.phase, moved, running)
    motion.current.turn = ride.current === 'walk' ? 0 : -vehicle.current.steering
    avatar.current.position.set(next.x, feetY, next.z)
    if (moved > .001 && !passengerPose && ride.current === 'walk') {
      const heading = Math.atan2(before.x - next.x, before.z - next.z), difference = Math.atan2(Math.sin(heading - avatar.current.rotation.y), Math.cos(heading - avatar.current.rotation.y))
      const rotation = difference * (1 - Math.exp(-delta * 9))
      avatar.current.rotation.y += rotation
      motion.current.turn = delta > 0 ? rotation / delta : 0
    }
    if (footballPitch && motion.current.kick !== footballControls.current.kick) {
      if (motion.current.kick !== undefined) avatar.current.rotation.y = yaw.current
      motion.current.kick = footballControls.current.kick
    }
    campusPose.current = { ...(ride.current !== 'walk' || passengerPose ? { pitch: avatar.current.rotation.x } : {}), airborne: !jump.current.grounded, vehicle: ride.current, x: next.x, y: feetY, z: next.z, yaw: avatar.current.rotation.y, moving: motion.current.moving, running: motion.current.running, active: allowed, visible: true, space: pose && plan ? interiorSpace(plan, journey.current?.lowFloor ?? pose.floor) : 'outdoors', epoch: campusEpoch.current }
    target.set(next.x, feetY + (sitting ? .9 : 1.35), next.z)
    const indoorFov = pose ? 75 : 60
    if ('fov' in camera && camera.fov !== indoorFov) { camera.fov = indoorFov; camera.updateProjectionMatrix() }
    const boom = pose ? Math.min(4.5, cameraDistance.current) : cameraDistance.current
    desired.set(next.x + Math.sin(yaw.current) * boom * Math.cos(pitch.current), target.y + Math.sin(pitch.current) * boom, next.z + Math.cos(yaw.current) * boom * Math.cos(pitch.current))
    const fraction = (end: Vector3) => pose && plan ? interiorCameraFraction(target, end, plan, pose.floor, journey.current?.lowFloor ?? null) : cameraBoomFraction(target, end, world)
    desired.lerpVectors(target, desired, fraction(desired))
    if (!snapped.current) { camera.position.copy(desired); snapped.current = true } else camera.position.lerp(desired, 1 - Math.exp(-delta * WALK_CONTROLS.cameraFollowRate))
    camera.position.lerpVectors(target, camera.position, fraction(camera.position))
    camera.position.y = Math.max(camera.position.y, (pose ? surfaceY : walkSurfaceHeightAt(twin.terrain, camera.position.x, camera.position.z)) + .3)
    // Tight doorways sometimes shorten the boom into the avatar. Show the
    // corridor instead of filling the screen with the back of its head.
    avatar.current.visible = camera.position.distanceTo(target) > 1.4
    camera.lookAt(target)
    elapsed.current += delta
    if (elapsed.current >= 0.2) {
      elapsed.current = 0
      publish(moved > .001, blocked)
    }
  })
  useEffect(() => () => { footballControls.current.actor = null }, [footballControls])
  return <group ref={avatar}><>{passengerView ? <StudentAvatar style={avatarStyle} motion={motion} jersey={footballJersey} accent={avatarAccent} /> : <CampusVehicle style={avatarStyle} mode={rideMode} motion={motion} jersey={footballJersey} accent={avatarAccent} />}</><SocialBubble session={campusSession} /></group>
}
