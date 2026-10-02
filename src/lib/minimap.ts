import { gpsToLocal } from './geo.ts'
import type { DigitalTwin } from './digitalTwin.ts'

export function miniMapData(twin: DigitalTwin | null) {
  const buildings = twin?.buildings.map((building, i) => ({ id: building.id, locationId: twin.selections[i].location.id, name: twin.selections[i].location.name,
    path: [building.outer, ...building.holes].map((ring) => ring.map((point, j) => { const { x, z } = gpsToLocal(point); return `${j ? 'L' : 'M'}${x} ${z}` }).join(' ') + 'Z').join(' ') })) ?? []
  const points = [...(twin?.boundary ?? []), ...(twin?.buildings.flatMap((building) => building.outer.map(gpsToLocal)) ?? []), ...(twin?.roads.flatMap((road) => road.paths.flat()) ?? [])]
  const minX = points.length ? Math.min(...points.map((p) => p.x)) - 25 : -100
  const minZ = points.length ? Math.min(...points.map((p) => p.z)) - 25 : -100
  const maxX = points.length ? Math.max(...points.map((p) => p.x)) + 25 : 100
  const maxZ = points.length ? Math.max(...points.map((p) => p.z)) + 25 : 100
  return { buildings, viewBox: `${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`,
    boundary: twin?.boundary.map((point) => `${point.x},${point.z}`).join(' ') ?? '',
    roads: twin?.roads.map((road) => ({ id: road.id, paths: road.paths.map((path) => path.map((point) => `${point.x},${point.z}`).join(' ')) })) ?? [] }
}
