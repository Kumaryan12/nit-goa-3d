import type { GeoCoordinate } from '../types/osm.ts'

export const LAT0 = 15.16773
export const LON0 = 74.01548
const LONGITUDE_METERS = 111320 * Math.cos((LAT0 * Math.PI) / 180)

export interface LocalCoordinate {
  x: number
  z: number
}

// East is +X, north is -Z, and one world unit is approximately one meter.
export function gpsToLocal({ lat, lon }: GeoCoordinate): LocalCoordinate {
  return {
    x: (lon - LON0) * LONGITUDE_METERS,
    z: -(lat - LAT0) * 110540,
  }
}

export function localToGps({ x, z }: LocalCoordinate): GeoCoordinate {
  return { lat: LAT0 - z / 110540, lon: LON0 + x / LONGITUDE_METERS }
}

export function isGeoCoordinate(point: unknown): point is GeoCoordinate {
  if (!point || typeof point !== 'object') return false
  const { lat, lon } = point as Partial<GeoCoordinate>
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180
}

export function sameCoordinate(a: GeoCoordinate, b: GeoCoordinate): boolean {
  return Math.abs(a.lat - b.lat) < 1e-8 && Math.abs(a.lon - b.lon) < 1e-8
}

// Never close an open OSM way artificially: only complete, nondegenerate rings
// are eligible to become building polygons.
export function validClosedRing(points: GeoCoordinate[] | undefined): GeoCoordinate[] | null {
  if (!Array.isArray(points) || points.length < 4 || !points.every(isGeoCoordinate)) return null
  if (!sameCoordinate(points[0], points[points.length - 1])) return null
  const ring = points.filter((point, index) => index === 0 || !sameCoordinate(point, points[index - 1]))
  if (ring.length < 4) return null
  const local = ring.map(gpsToLocal)
  let twiceArea = 0
  for (let i = 0; i < local.length - 1; i++) {
    twiceArea += local[i].x * local[i + 1].z - local[i + 1].x * local[i].z
  }
  return Math.abs(twiceArea) > 0.02 ? ring : null
}

export function pointInRing(point: GeoCoordinate, ring: GeoCoordinate[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if ((a.lat > point.lat) !== (b.lat > point.lat)
      && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside
    }
  }
  return inside
}

export function groundSizeForCoordinates(points: GeoCoordinate[]): number {
  const extent = points.reduce((max, point) => {
    const { x, z } = gpsToLocal(point)
    return Math.max(max, Math.abs(x), Math.abs(z))
  }, 0)
  // Keep the ground centered at the GPS origin and cover real campus extents.
  return Math.max(400, Math.ceil((extent * 2 + 100) / 10) * 10)
}
