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
