import { Path, Shape, ShapeUtils, Vector2 } from 'three'
import { gpsToLocal } from './geo.ts'
import type { BuildingFootprint, GeoCoordinate } from '../types/osm.ts'

function shapePoints(ring: GeoCoordinate[], clockwise: boolean): Vector2[] {
  // Shape lies in XY. After a -90 degree X rotation, (x, -z, depth)
  // becomes world (x, depth, z), so every building rises above Y = 0.
  const points = ring.slice(0, -1).map((coordinate) => {
    const { x, z } = gpsToLocal(coordinate)
    return new Vector2(x, -z)
  })
  return ShapeUtils.isClockWise(points) === clockwise ? points : points.reverse()
}

export function buildingShape(building: BuildingFootprint): Shape {
  const shape = new Shape(shapePoints(building.outer, true))
  shape.holes = building.holes.map((ring) => new Path(shapePoints(ring, false)))
  return shape
}

// Expand the outside silhouette around its own center, preserving courtyard
// openings. Expanding world-origin coordinates would shift the entire roof.
export function roofShape(building: BuildingFootprint): Shape {
  const shape = buildingShape(building)
  const points = shape.getPoints()
  const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y))
  const center = new Vector2((minX + maxX) / 2, (minY + maxY) / 2)
  const outer = points.map((point) => point.clone().sub(center).multiplyScalar(1.012).add(center))
  const roof = new Shape(outer)
  roof.holes = shape.holes
  return roof
}
