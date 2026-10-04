import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Group } from 'three'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { LocalCoordinate } from '../lib/geo'
import { cameraBoomFraction, createWalkWorld, emptyWalkInput, findWalkSpawn, isWalkable, nearestWalkLocation, stepWalking, walkSurfaceHeightAt } from '../lib/walking'
import type { WalkInput, WalkSpawnRequest, WalkStatus } from '../lib/walking'
import { footballToLocal, footballToWorld } from '../lib/football'
import type { FootballControls, FootballPitch } from '../lib/football'
import StudentAvatar from './StudentAvatar'
import { advanceLocomotion, freshLocomotion, motionDelta, reconcileLocomotion, stridePhase } from '../lib/avatarMotion'
import type { AvatarMotion } from '../lib/avatarMotion'
import type { CampusPose } from '../lib/campusProtocol'
import { canUseStairs, interiorFloorPlan, interiorLocationId, interiorRoomLabel, interiorSpace, interiorCameraFraction, isInteriorWalkable, landingLookDirection, pointDistance, roomAtPoint, stairLanding, stairSample, stepInterior } from '../lib/hostelInterior'
import type { HostelAction, HostelPlan, InteriorPose, StairJourney } from '../lib/hostelInterior'

const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
const editingText = () => { const element = document.activeElement; return element instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable) }
export default function AvatarExplorer({ campusPose, footballPitch, footballControls, footballLive, footballJersey, hostelPlan, gyanPlan, interiorPose, processedSpawn, twin, paused, input, position, spawn, onStatus, onInspect }: {
  campusPose: React.RefObject<CampusPose | null>
  footballPitch: FootballPitch | null; footballControls: React.RefObject<FootballControls>; footballLive: boolean; footballJersey?: string
  hostelPlan: HostelPlan | null; gyanPlan: HostelPlan | null; interiorPose: React.RefObject<InteriorPose | null>
  processedSpawn: React.RefObject<number>
  twin: DigitalTwin; paused: boolean; input: React.RefObject<WalkInput>; position: React.RefObject<LocalCoordinate | null>; spawn: WalkSpawnRequest;
  onStatus: (status: WalkStatus) => void; onInspect: (id: string) => void
}) {
  const journey = useRef<StairJourney | null>(null), actionContext = useRef<WalkStatus | null>(null)
  const campusEpoch = useRef((campusPose.current?.epoch ?? 0) + 1)
  const { gl, camera } = useThree(), avatar = useRef<Group>(null), yaw = useRef(0), pitch = useRef(0.28), cameraDistance = useRef(7)
  const keys = useRef(new Set<string>()), motion = useRef<AvatarMotion>({ phase: 0, moving: false, speed: 0, running: false }), locomotion = useRef(freshLocomotion()), elapsed = useRef(0), nearest = useRef<string | null>(null)
  const world = useMemo(() => createWalkWorld(twin.buildings, twin.boundary, twin.terrain), [twin])
  const locations = useMemo(() => [...twin.locations, ...twin.selections.filter(item => item.matchMethod === 'unmatched').map(item => item.location)].map(location => ({ ...location, osmBuildingId: twin.selections.find(item => item.location.id === location.id)?.buildingId ?? location.osmBuildingId })), [twin])
  const activePlan = useCallback(() => {const pose=interiorPose.current, plan=pose?.buildingId===gyanPlan?.buildingId?gyanPlan:hostelPlan;return plan&&pose?interiorFloorPlan(plan,pose.floor):plan},[gyanPlan,hostelPlan,interiorPose])
  const target = useMemo(() => new Vector3(), []), desired = useMemo(() => new Vector3(), []), snapped = useRef(false), oriented = useRef(false)
  const publish = useCallback((moving = false, blocked = false, error?: string) => {
    const p = position.current; if (!p) return
    const plan=activePlan(), pose = interiorPose.current, place = pose && plan ? { id: interiorLocationId(plan), distance: 0 } : nearestWalkLocation(p, locations, world)
    nearest.current = place && place.distance <= 25 ? place.id : null
    const room = pose && plan ? roomAtPoint(plan, p) : null
    const status: WalkStatus = {
      position: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }, nearestId: nearest.current, distance: place?.distance ?? Infinity, moving, blocked, error,
      canEnterHostel: !pose && !!hostelPlan && pointDistance(p, hostelPlan.entrance.outside) <= 5,
      canEnterGyan: !pose && !!gyanPlan && pointDistance(p, gyanPlan.entrance.outside) <= 5,
      interior: pose && plan ? { kind: plan.kind, name: plan.name, levels: plan.levels, floor: pose.floor, room: room ? interiorRoomLabel(plan, pose.floor, room.id) : null, canGoUp: !journey.current && canUseStairs(plan, p, pose.floor, true), canGoDown: !journey.current && canUseStairs(plan, p, pose.floor, false), stairLowFloor: journey.current?.lowFloor ?? null } : undefined,
    }
    actionContext.current = status; onStatus(status)
  }, [hostelPlan, gyanPlan, activePlan, interiorPose, position, locations, world, onStatus])
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
      else if (spawn.locationId === 'open-air-theatre') position.current = findWalkSpawn(twin.theatre.entrance, world)
      else if(gyanPlan && spawn.locationId===interiorLocationId(gyanPlan)) position.current={...gyanPlan.entrance.outside}
      else position.current = hostelPlan && spawn.locationId === 'boys-hostel' ? { ...hostelPlan.entrance.outside } : findWalkSpawn(anchor.coordinates, world)
    } else if (pose && !validInside) interiorPose.current = null
    // Switching modes during a stair walk returns to a safe same-floor landing.
    if (validInside && position.current && plan && pointDistance(position.current, plan.stairs.start) + pointDistance(position.current, plan.stairs.end) < plan.stairs.length + .3) position.current = stairLanding(plan, pose!.floor < plan.levels - 1)
    journey.current = null; campusEpoch.current++; locomotion.current = freshLocomotion(); motion.current = { phase: 0, moving: false, speed: 0, running: false }; processedSpawn.current = spawn.sequence
    if (avatar.current) avatar.current.visible = !!position.current
    nearest.current = null
    if (!position.current) onStatus({ position: anchor.coordinates, nearestId: null, distance: Infinity, moving: false, blocked: false, error: `No open ground near ${anchor.name}. Choose another starting place.` })
    else {
      if (relocating || !oriented.current) {
        const points = world.buildings.length ? world.buildings.map(building => ({ x: (building.minX + building.maxX) / 2, z: (building.minZ + building.maxZ) / 2 })) : twin.boundary
        const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, z: sum.z + point.z / points.length }), { x: 0, z: 0 })
        const nearBuilding = relocating && world.buildings.some(building => building.id === (anchor.osmBuildingId ?? anchor.id))
        yaw.current = nearBuilding ? Math.atan2(anchor.coordinates.x - position.current.x, anchor.coordinates.z - position.current.z) : Math.atan2(position.current.x - center.x, position.current.z - center.z)
        if (spawn.football && footballPitch) yaw.current = Math.atan2(-Math.cos(footballPitch.rotation), Math.sin(footballPitch.rotation))
        if (spawn.locationId === 'open-air-theatre') yaw.current = Math.atan2(position.current.x - twin.theatre.center.x, position.current.z - twin.theatre.center.z)
        if (gyanPlan && spawn.locationId===interiorLocationId(gyanPlan)) yaw.current=Math.atan2(-gyanPlan.entrance.inward.x,-gyanPlan.entrance.inward.z)
        if (hostelPlan && spawn.locationId === 'boys-hostel') yaw.current = Math.atan2(-hostelPlan.entrance.inward.x, -hostelPlan.entrance.inward.z)
        if (avatar.current) avatar.current.rotation.y = yaw.current
        oriented.current = true
      }
      publish()
    }
    if (spawn.football && relocating) { gl.domElement.tabIndex = 0; gl.domElement.focus({ preventScroll: true }) }
    snapped.current = false; keys.current.clear(); input.current = emptyWalkInput()
  }, [world, spawn, locations, twin, input, position, interiorPose, processedSpawn, hostelPlan, gyanPlan, activePlan, onStatus, publish, footballPitch, gl])
  const act = useCallback((action: HostelAction) => {
    const plan = action==='enter-gyan'?gyanPlan:action==='enter-hostel'?hostelPlan:activePlan(), p = position.current, pose = interiorPose.current
    if (!plan || !p || journey.current) return
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
    campusEpoch.current++
    keys.current.clear(); input.current = emptyWalkInput(); locomotion.current = freshLocomotion(); snapped.current = false; publish()
  }, [hostelPlan, gyanPlan, activePlan, position, interiorPose, input, publish])
  useEffect(() => {
    const fov = camera instanceof Object && 'fov' in camera ? camera.fov : null, near = camera.near
    camera.near = 0.1; if ('fov' in camera) camera.fov = 60; camera.updateProjectionMatrix()
    return () => { camera.near = near; if ('fov' in camera && typeof fov === 'number') camera.fov = fov; camera.updateProjectionMatrix() }
  }, [camera])
  useEffect(() => {
    const clear = () => { keys.current.clear(); input.current = emptyWalkInput(); locomotion.current = freshLocomotion() }
    if (paused) clear()
    const down = (event: KeyboardEvent) => {
      if (paused || editingText() || event.metaKey || event.ctrlKey || event.altKey) return
      if (movementKeys.has(event.code)) { event.preventDefault(); keys.current.add(event.code) }
      if (event.code === 'Space' && footballPitch && !event.repeat && !(event.target instanceof HTMLElement && event.target.closest('button'))) { event.preventDefault(); footballControls.current.kick++ }
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
    return () => { clear(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', hidden) }
  }, [paused, input, onInspect, act, activePlan, interiorPose, position, footballPitch, footballControls])
  useEffect(() => {
    const canvas = gl.domElement
    let drag: { id: number; x: number; y: number } | null = null
    const start = (event: PointerEvent) => { if (!paused && event.button === 0 && event.isPrimary) { drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId) } }
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return
      yaw.current -= (event.clientX - drag.x) * 0.005; pitch.current = Math.max(0.08, Math.min(0.8, pitch.current + (event.clientY - drag.y) * 0.004))
      drag.x = event.clientX; drag.y = event.clientY
    }
    const end = () => { const pointer = drag; drag = null; if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id) }
    const wheel = (event: WheelEvent) => { if (!paused) { event.preventDefault(); cameraDistance.current = Math.max(3, Math.min(12, cameraDistance.current + event.deltaY * 0.008)) } }
    canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end); canvas.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('blur', end)
    return () => { end(); canvas.removeEventListener('pointerdown', start); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', end); canvas.removeEventListener('pointercancel', end); canvas.removeEventListener('lostpointercapture', end); canvas.removeEventListener('wheel', wheel); window.removeEventListener('blur', end) }
  }, [gl, paused])
  useFrame((_, delta) => {
    if (!avatar.current || !position.current) return
    delta = motionDelta(delta)
    const allowed = !paused && !editingText() && !document.hidden, key = (code: string) => allowed && keys.current.has(code) ? 1 : 0
    const forward = allowed ? key('KeyW') + key('ArrowUp') - key('KeyS') - key('ArrowDown') + input.current.forward : 0
    const side = allowed ? key('KeyD') - key('KeyA') + input.current.side : 0
    const turn = allowed ? key('ArrowLeft') - key('ArrowRight') + input.current.turn : 0
    yaw.current += turn * Math.min(delta, 0.1) * 1.8
    const direction = { x: -Math.sin(yaw.current) * forward + Math.cos(yaw.current) * side, z: -Math.cos(yaw.current) * forward - Math.sin(yaw.current) * side }
    if (input.current.action) { const action = input.current.action; delete input.current.action; if (allowed) act(action) }
    const before = position.current, pose = interiorPose.current, plan = activePlan()
    // Room admission can relocate a football player between render frames.
    if (Math.hypot(before.x - avatar.current.position.x, before.z - avatar.current.position.z) > 2) campusEpoch.current++
    const running = !!(allowed && (key('ShiftLeft') || key('ShiftRight') || input.current.running))
    const travel = advanceLocomotion(locomotion.current, direction, running ? pose ? 3.5 : 5.5 : 2.3, delta, allowed && !journey.current)
    let next = before, surfaceY = walkSurfaceHeightAt(twin.terrain, before.x, before.z)
    if (pose && plan) {
      surfaceY = plan.base + pose.floor * plan.floorHeight + .14
      if (journey.current) {
        if (allowed) journey.current.progress += Math.min(delta, .1) / 3.4
        const sample = stairSample(plan, journey.current); next = sample.point; surfaceY = sample.y
        if (sample.complete) {
          pose.floor = sample.floor; journey.current = null; position.current = next
          const look = landingLookDirection(plan, next); yaw.current = Math.atan2(-look.x,-look.z)
          avatar.current.rotation.y = yaw.current; snapped.current = false; publish()
        }
      } else next = stepInterior(before, travel.direction, travel.speed, travel.delta, plan)
    } else {
      next = stepWalking(before, travel.direction, travel.speed, travel.delta, world)
      surfaceY = walkSurfaceHeightAt(twin.terrain, next.x, next.z)
    }
    if (footballPitch && !pose) { const local = footballToLocal(next, footballPitch); next = footballToWorld({ x:Math.max(-44,Math.min(44,local.x)), z:Math.max(-24,Math.min(24,local.z)) }, footballPitch); surfaceY = footballPitch.elevation + .11 }
    reconcileLocomotion(locomotion.current, before, next, travel)
    const moved = Math.hypot(next.x - before.x, next.z - before.z), blocked = Math.hypot(direction.x, direction.z) > 0 && moved < .001 && !journey.current
    footballControls.current.actor = footballPitch ? { position:{...next}, direction:{x:-Math.sin(yaw.current),z:-Math.cos(yaw.current)}, moving:moved>.001, running, active:allowed && footballLive && !pose } : null
    position.current = next
    motion.current.moving = moved > .001
    motion.current.speed = delta > 0 ? Math.min(5.5, moved / delta) : 0
    motion.current.running = running
    motion.current.paused = !allowed
    motion.current.phase = stridePhase(motion.current.phase, moved, running)
    motion.current.turn = 0
    avatar.current.position.set(next.x, surfaceY, next.z)
    if (moved > .001) {
      const heading = Math.atan2(before.x - next.x, before.z - next.z), difference = Math.atan2(Math.sin(heading - avatar.current.rotation.y), Math.cos(heading - avatar.current.rotation.y))
      const rotation = difference * (1 - Math.exp(-delta * 12))
      avatar.current.rotation.y += rotation
      motion.current.turn = delta > 0 ? rotation / delta : 0
    }
    if (footballPitch && motion.current.kick !== footballControls.current.kick) {
      if (motion.current.kick !== undefined) avatar.current.rotation.y = yaw.current
      motion.current.kick = footballControls.current.kick
    }
    campusPose.current = { x: next.x, y: surfaceY, z: next.z, yaw: avatar.current.rotation.y, moving: motion.current.moving, running, active: allowed, visible: true, space: pose && plan ? interiorSpace(plan, journey.current?.lowFloor ?? pose.floor) : 'outdoors', epoch: campusEpoch.current }
    target.set(next.x, surfaceY + 1.35, next.z)
    const indoorFov = pose ? 75 : 60
    if ('fov' in camera && camera.fov !== indoorFov) { camera.fov = indoorFov; camera.updateProjectionMatrix() }
    const boom = pose ? Math.min(4.5, cameraDistance.current) : cameraDistance.current
    desired.set(next.x + Math.sin(yaw.current) * boom * Math.cos(pitch.current), target.y + Math.sin(pitch.current) * boom, next.z + Math.cos(yaw.current) * boom * Math.cos(pitch.current))
    const fraction = (end: Vector3) => pose && plan ? interiorCameraFraction(target, end, plan, pose.floor, journey.current?.lowFloor ?? null) : cameraBoomFraction(target, end, world)
    desired.lerpVectors(target, desired, fraction(desired))
    if (!snapped.current) { camera.position.copy(desired); snapped.current = true } else camera.position.lerp(desired, 1 - Math.exp(-delta * 12))
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
  return <group ref={avatar}><StudentAvatar motion={motion} jersey={footballJersey} /></group>
}
