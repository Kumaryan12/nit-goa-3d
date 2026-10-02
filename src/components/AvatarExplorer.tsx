import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Group } from 'three'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { LocalCoordinate } from '../lib/geo'
import { terrainHeightAt } from '../lib/terrain'
import { cameraBoomFraction, createWalkWorld, emptyWalkInput, findWalkSpawn, isWalkable, nearestWalkLocation, stepWalking } from '../lib/walking'
import type { WalkInput, WalkSpawnRequest, WalkStatus } from '../lib/walking'
import StudentAvatar from './StudentAvatar'

const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
const editingText = () => { const element = document.activeElement; return element instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable) }
export default function AvatarExplorer({ twin, paused, input, position, spawn, onStatus, onInspect }: {
  twin: DigitalTwin; paused: boolean; input: React.RefObject<WalkInput>; position: React.RefObject<LocalCoordinate | null>; spawn: WalkSpawnRequest;
  onStatus: (status: WalkStatus) => void; onInspect: (id: string) => void
}) {
  const { gl, camera } = useThree(), avatar = useRef<Group>(null), yaw = useRef(0), pitch = useRef(0.28), cameraDistance = useRef(7)
  const keys = useRef(new Set<string>()), lastSpawn = useRef(spawn.sequence), motion = useRef({ phase: 0, moving: false }), elapsed = useRef(0), nearest = useRef<string | null>(null)
  const world = useMemo(() => createWalkWorld(twin.buildings, twin.boundary, twin.terrain), [twin])
  const locations = useMemo(() => [...twin.locations, ...twin.selections.filter(item => item.matchMethod === 'unmatched').map(item => item.location)].map(location => ({ ...location, osmBuildingId: twin.selections.find(item => item.location.id === location.id)?.buildingId ?? location.osmBuildingId })), [twin])
  const target = useMemo(() => new Vector3(), []), desired = useMemo(() => new Vector3(), []), snapped = useRef(false), oriented = useRef(false)
  useEffect(() => {
    const anchor = locations.find(location => location.id === spawn.locationId) ?? twin.locations.find(location => location.id === 'main-entrance')!
    const relocating = lastSpawn.current !== spawn.sequence || !position.current || !isWalkable(position.current, world)
    if (relocating) position.current = findWalkSpawn(anchor.coordinates, world)
    lastSpawn.current = spawn.sequence
    if (avatar.current) avatar.current.visible = !!position.current
    nearest.current = null
    if (!position.current) onStatus({ position: anchor.coordinates, nearestId: null, distance: Infinity, moving: false, blocked: false, error: `No open ground near ${anchor.name}. Choose another starting place.` })
    else {
      if (relocating || !oriented.current) {
        // Face the built campus when returning from Overview. At a building start,
        // face into open space instead of staring at its wall.
        const points = world.buildings.length ? world.buildings.map(building => ({ x: (building.minX + building.maxX) / 2, z: (building.minZ + building.maxZ) / 2 })) : twin.boundary
        const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, z: sum.z + point.z / points.length }), { x: 0, z: 0 })
        const nearBuilding = relocating && world.buildings.some(building => building.id === (anchor.osmBuildingId ?? anchor.id))
        yaw.current = nearBuilding ? Math.atan2(anchor.coordinates.x - position.current.x, anchor.coordinates.z - position.current.z) : Math.atan2(position.current.x - center.x, position.current.z - center.z)
        if (avatar.current) avatar.current.rotation.y = yaw.current
        oriented.current = true
      }
      const place = nearestWalkLocation(position.current, locations, world)
      nearest.current = place && place.distance <= 25 ? place.id : null
      onStatus({ position: { ...position.current }, nearestId: nearest.current, distance: place?.distance ?? Infinity, moving: false, blocked: false })
    }
    snapped.current = false; keys.current.clear(); input.current = emptyWalkInput()
  }, [world, spawn, locations, twin, input, position, onStatus])
  useEffect(() => {
    const fov = camera instanceof Object && 'fov' in camera ? camera.fov : null, near = camera.near
    camera.near = 0.1; if ('fov' in camera) camera.fov = 60; camera.updateProjectionMatrix()
    return () => { camera.near = near; if ('fov' in camera && typeof fov === 'number') camera.fov = fov; camera.updateProjectionMatrix() }
  }, [camera])
  useEffect(() => {
    const clear = () => { keys.current.clear(); input.current = emptyWalkInput() }
    if (paused) clear()
    const down = (event: KeyboardEvent) => {
      if (paused || editingText() || event.metaKey || event.ctrlKey || event.altKey) return
      if (movementKeys.has(event.code)) { event.preventDefault(); keys.current.add(event.code) }
      if (event.code === 'KeyE' && !event.repeat && nearest.current) { event.preventDefault(); clear(); onInspect(nearest.current) }
      if (event.code === 'Escape') clear()
    }
    const up = (event: KeyboardEvent) => { keys.current.delete(event.code) }
    const hidden = () => { if (document.hidden) clear() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', hidden)
    return () => { clear(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', hidden) }
  }, [paused, input, onInspect])
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
    const allowed = !paused && !editingText() && !document.hidden, key = (code: string) => allowed && keys.current.has(code) ? 1 : 0
    const forward = allowed ? key('KeyW') + key('ArrowUp') - key('KeyS') - key('ArrowDown') + input.current.forward : 0
    const side = allowed ? key('KeyD') - key('KeyA') + input.current.side : 0
    const turn = allowed ? key('ArrowLeft') - key('ArrowRight') + input.current.turn : 0
    yaw.current += turn * Math.min(delta, 0.1) * 1.8
    const direction = { x: -Math.sin(yaw.current) * forward + Math.cos(yaw.current) * side, z: -Math.cos(yaw.current) * forward - Math.sin(yaw.current) * side }
    const before = position.current, next = stepWalking(before, direction, allowed && (key('ShiftLeft') || key('ShiftRight') || input.current.running) ? 5.5 : 2.3, delta, world)
    const moved = Math.hypot(next.x - before.x, next.z - before.z), blocked = Math.hypot(direction.x, direction.z) > 0 && moved < 0.001
    position.current = next; motion.current.moving = moved > 0.001; motion.current.phase += moved * 7
    avatar.current.position.set(next.x, terrainHeightAt(twin.terrain, next.x, next.z), next.z)
    if (moved > 0.001) {
      const heading = Math.atan2(-direction.x, -direction.z), difference = Math.atan2(Math.sin(heading - avatar.current.rotation.y), Math.cos(heading - avatar.current.rotation.y))
      avatar.current.rotation.y += difference * (1 - Math.exp(-delta * 14))
    }
    target.set(next.x, avatar.current.position.y + 1.35, next.z)
    const boom = cameraDistance.current
    desired.set(next.x + Math.sin(yaw.current) * boom * Math.cos(pitch.current), target.y + Math.sin(pitch.current) * boom, next.z + Math.cos(yaw.current) * boom * Math.cos(pitch.current))
    desired.lerpVectors(target, desired, cameraBoomFraction(target, desired, world))
    if (!snapped.current) { camera.position.copy(desired); snapped.current = true } else camera.position.lerp(desired, 1 - Math.exp(-delta * 12))
    // Smoothing must not carry the camera through a wall while turning.
    camera.position.lerpVectors(target, camera.position, cameraBoomFraction(target, camera.position, world))
    camera.position.y = Math.max(camera.position.y, terrainHeightAt(twin.terrain, camera.position.x, camera.position.z) + 0.3)
    camera.lookAt(target)
    elapsed.current += delta
    if (elapsed.current >= 0.2) {
      elapsed.current = 0
      const place = nearestWalkLocation(next, locations, world); nearest.current = place && place.distance <= 25 ? place.id : null
      onStatus({ position: { x: Math.round(next.x * 10) / 10, z: Math.round(next.z * 10) / 10 }, nearestId: nearest.current, distance: place?.distance ?? Infinity, moving: moved > 0.001, blocked })
    }
  })
  return <group ref={avatar}><StudentAvatar motion={motion} /></group>
}
