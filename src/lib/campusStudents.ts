import type { DigitalTwin } from './digitalTwin.ts'
import type { LocalCoordinate } from './geo.ts'
import type { WalkWorld } from './walking.ts'
import type { SocialSeat } from './social.ts'
import { createWalkWorld, isWalkable, walkSurfaceHeightAt } from './walking.ts'
import { createRoadGraph, planWalkingRoute } from './pathfinding.ts'
import { findLocationArrival } from './walkArrival.ts'
import { cumulativeDistances } from './traversal.ts'
import { theatreSeats } from './social.ts'
import { CAFE_BUILDING_ID } from './cafe.ts'
import { GYAN_MANDIR_ID } from './hostelInterior.ts'

export interface StudentRoute { from: string; to: string; points: LocalCoordinate[]; lengths: number[] }
export interface StudentPlan {
  id: string; name: string; style: 'boy' | 'girl'; color: string; role: 'walker' | 'chat' | 'seated'
  point: LocalCoordinate; yaw: number; route?: StudentRoute; offset: number; speed: number
  seat?: SocialSeat; stand?: LocalCoordinate; partner?: LocalCoordinate
}
const distance = (a: LocalCoordinate, b: LocalCoordinate) => Math.hypot(a.x - b.x, a.z - b.z)

export function studentSegmentClear(a: LocalCoordinate, b: LocalCoordinate, world: WalkWorld): boolean {
  const length = distance(a, b), count = Math.max(1, Math.ceil(length / .45))
  let lastY = walkSurfaceHeightAt(world.terrain, a.x, a.z)
  for (let i = 0; i <= count; i++) {
    const t = i / count, point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, y = walkSurfaceHeightAt(world.terrain, point.x, point.z)
    if (!isWalkable(point, world, .45) || Math.abs(y - lastY) > length / count * 1.2 + .17) return false
    lastY = y
  }
  return true
}

// Small, bounded detours connect road paths to entrances, around trunks/walls.
// This runs in the existing campus worker, never in the render loop.
export function studentDetour(start: LocalCoordinate, end: LocalCoordinate, world: WalkWorld): LocalCoordinate[] | null {
  if (!isWalkable(start, world, .45) || !isWalkable(end, world, .45)) return null
  if (studentSegmentClear(start, end, world)) return [start, end]
  const step = 1.5, key = (x: number, z: number) => `${x}:${z}`
  const open = [{ x: 0, z: 0, score: distance(start, end) }], best = new Map<string, number>([['0:0', 0]]), previous = new Map<string, string>(), points = new Map<string, LocalCoordinate>([['0:0', start]])
  const bounds = { x0: Math.min(start.x, end.x) - 12, x1: Math.max(start.x, end.x) + 12, z0: Math.min(start.z, end.z) - 12, z1: Math.max(start.z, end.z) + 12 }
  let visited = 0
  while (open.length && visited++ < 1800) {
    let index = 0
    for (let i = 1; i < open.length; i++) if (open[i].score < open[index].score) index = i
    const current = open.splice(index, 1)[0], id = key(current.x, current.z), point = points.get(id)!, cost = best.get(id)!
    if (distance(point, end) < step * 1.5 && studentSegmentClear(point, end, world)) {
      const path = [end, point]; let cursor = id
      while (previous.has(cursor)) { cursor = previous.get(cursor)!; path.push(points.get(cursor)!) }
      return path.reverse()
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = current.x + dx, z = current.z + dz, nextId = key(x, z), next = { x: start.x + x * step, z: start.z + z * step }, nextCost = cost + Math.hypot(dx, dz) * step
      if (next.x < bounds.x0 || next.x > bounds.x1 || next.z < bounds.z0 || next.z > bounds.z1 || nextCost >= (best.get(nextId) ?? Infinity) || !studentSegmentClear(point, next, world)) continue
      best.set(nextId, nextCost); previous.set(nextId, id); points.set(nextId, next)
      open.push({ x, z, score: nextCost + distance(next, end) })
    }
  }
  return null
}

/** Deterministic fictional students, separate from authenticated people/profiles. */
export function createCampusStudents(twin: DigitalTwin, suppliedWorld?: WalkWorld): StudentPlan[] {
  if (!twin.vegetationReady || twin.boundary.length < 3 || !twin.roads.length) return []
  const world = suppliedWorld ?? createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps), graph = createRoadGraph(twin.roads, { allowPrivate: true })
  const plans: StudentPlan[] = [], names = ['Aarav', 'Riya', 'Kabir', 'Meera', 'Ishaan', 'Anaya', 'Dev', 'Tara', 'Neil', 'Diya', 'Arjun', 'Sana', 'Vihaan', 'Ira', 'Rohan', 'Myra']
  const add = (role: StudentPlan['role'], point: LocalCoordinate, yaw: number, rest: Partial<StudentPlan> = {}) => {
    const i = plans.length
    plans.push({ id: `npc-student-${i}`, name: names[i % names.length], style: i % 2 ? 'girl' : 'boy', color: ['#287e78', '#b66b51', '#516a99', '#a68b48', '#79719d', '#467c58'][i % 6], role, point, yaw, offset: i * 17.3, speed: 1.05 + (i % 4) * .12, ...rest })
  }
  const ids = ['main-entrance', 'administration-block', 'boys-hostel', GYAN_MANDIR_ID, 'girls-hostel', 'academic-block', CAFE_BUILDING_ID, 'way/1423803680', 'open-air-theatre']
  const locations = [...twin.locations, ...twin.selections.map(s => s.location)]
  const stops = ids.flatMap(id => {
    const location = locations.find(l => l.id === id), arrival = location && findLocationArrival(location, twin, world)
    return arrival && location ? [{ name: location.name, point: arrival.position }] : []
  })
  const routes: StudentRoute[] = []
  for (let i = 0; i < stops.length && routes.length < 4; i++) {
    const from = stops[i], to = stops[(i + 1) % stops.length], road = planWalkingRoute(from.point, to.point, graph)
    if (!road || road.distance < 30 || road.distance > 1000) continue
    const raw = [from.point, ...road.path, to.point], points = [raw[0]]
    let valid = true
    for (let j = 1; j < raw.length; j++) {
      if (distance(points.at(-1)!, raw[j]) < .01) continue
      const connection = studentDetour(points.at(-1)!, raw[j], world)
      if (!connection) { valid = false; break }
      points.push(...connection.slice(1))
    }
    if (!valid) continue
    routes.push({ from: from.name, to: to.name, points, lengths: cumulativeDistances(points) })
  }
  for (const route of routes) for (let i = 0; i < 2; i++) add('walker', route.points[0], 0, { route, offset: i ? route.lengths.at(-1)! / 1.17 * .72 : plans.length * 13.7 })
  // Conversation pairs gather off the walking line; both stand on clear ground.
  for (const stop of [stops.find(s => s.name.toLowerCase().includes('gyan')), stops.find(s => s.name.toLowerCase().includes('café') || s.name.toLowerCase().includes('nescafe'))].filter(s => !!s)) {
    let placed = false
    for (const radius of [3, 5, 7]) {
      if (placed) break
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, center = { x: stop.point.x + Math.sin(angle) * radius, z: stop.point.z + Math.cos(angle) * radius }, a = { x: center.x - .85, z: center.z }, b = { x: center.x + .85, z: center.z }
        if (!isWalkable(a, world, .7) || !isWalkable(b, world, .7) || !studentSegmentClear(a, b, world)) continue
        add('chat', a, -Math.PI / 2, { partner: b }); add('chat', b, Math.PI / 2, { partner: a }); placed = true; break
      }
    }
  }
  const seats = [...(twin.terrain.cafe?.seats.filter((_, i) => i === 1 || i === 6) ?? []), ...theatreSeats(twin.theatre).filter(s => s.id === 'oat-1-3' || s.id === 'oat-1-4')]
  for (const seat of seats) {
    let stand: LocalCoordinate | undefined
    for (const out of [.9, 1.2, 1.6, 2, 2.5, 3]) {
      for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI, .75, -.75, 2.3, -2.3]) {
        const angle = seat.yaw + turn
        const p = { x: seat.x - Math.sin(angle) * out, z: seat.z - Math.cos(angle) * out }
        if (isWalkable(p, world, .48) && Math.abs(walkSurfaceHeightAt(world.terrain, p.x, p.z) - seat.y) < .85) { stand = p; break }
      }
      if (stand) break
    }
    if (stand) add('seated', seat, seat.yaw, { seat, stand })
  }
  return plans.slice(0, 16)
}
