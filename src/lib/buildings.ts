import { sameCoordinate, validClosedRing, isGeoCoordinate, pointInRing } from './geo.ts'
import type { BuildingFootprint, GeoCoordinate, OSMElement, OSMTags } from '../types/osm.ts'

export const DEFAULT_BUILDING_HEIGHT = 10

export function parseHeight(value: string | undefined): number | null {
  if (typeof value !== 'string') return null
  // Accept only a complete positive decimal in meters, never partial parses.
  const match = value.trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*(?:m)?$/i)
  if (!match) return null
  const height = Number(match[1])
  return Number.isFinite(height) && height > 0 ? height : null
}

export function buildingHeight(tags: OSMTags): number {
  return parseHeight(tags.height)
    ?? ((parseHeight(tags['building:levels']) ?? 0) * 3.2 || DEFAULT_BUILDING_HEIGHT)
}

export function isBuilding(element: OSMElement): boolean {
  return typeof element.tags?.building === 'string' && element.tags.building !== 'no'
}

// Relation members can arrive as open fragments and in either direction.
// Join matching endpoints; leave incomplete fragments out of the result.
export function joinMemberRings(segments: GeoCoordinate[][]): GeoCoordinate[][] {
  const remaining = segments
    .filter((segment) => Array.isArray(segment) && segment.length >= 2 && segment.every(isGeoCoordinate))
    .map((segment) => [...segment])
  const rings: GeoCoordinate[][] = []

  while (remaining.length > 0) {
    let ring = remaining.shift()!
    while (!sameCoordinate(ring[0], ring[ring.length - 1])) {
      const first = ring[0]
      const last = ring[ring.length - 1]
      const index = remaining.findIndex((part) =>
        sameCoordinate(last, part[0]) || sameCoordinate(last, part[part.length - 1])
        || sameCoordinate(first, part[0]) || sameCoordinate(first, part[part.length - 1]),
      )
      if (index === -1) break
      const part = remaining.splice(index, 1)[0]
      if (sameCoordinate(last, part[0])) ring.push(...part.slice(1))
      else if (sameCoordinate(last, part[part.length - 1])) ring.push(...part.reverse().slice(1))
      else if (sameCoordinate(first, part[part.length - 1])) ring = [...part.slice(0, -1), ...ring]
      else ring = [...part.reverse().slice(0, -1), ...ring]
    }
    const closed = validClosedRing(ring)
    if (closed) rings.push(closed)
  }
  return rings
}

export function extractBuildingFootprints(elements: OSMElement[]): BuildingFootprint[] {
  const buildings: BuildingFootprint[] = []
  const memberWays = new Set<number>()
  const seen = new Set<string>()

  // Process relations first so their member ways aren't rendered twice.
  for (const element of elements) {
    if (element.type !== 'relation' || !isBuilding(element) || !Array.isArray(element.members)) continue
    const key = `relation/${element.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const members = element.members.filter((member) => member.type === 'way' && Array.isArray(member.geometry))
    const outerMembers = members.filter((member) => ['outer', 'outline', ''].includes(member.role))
    const innerMembers = members.filter((member) => member.role === 'inner')
    const outers = joinMemberRings(outerMembers.map((member) => member.geometry!))
    const inners = joinMemberRings(innerMembers.map((member) => member.geometry!))
    outers.forEach((outer, index) => {
      const tags = element.tags ?? {}
      buildings.push({
        id: `${key}/${index}`,
        osmType: element.type,
        osmId: element.id,
        tags,
        outer,
        holes: inners.filter((inner) => inner.slice(0, -1).every((point) => pointInRing(point, outer))),
        height: buildingHeight(tags),
      })
      // Only suppress ways actually incorporated into a valid outer or hole.
      const includedRings = [outer, ...buildings[buildings.length - 1].holes]
      for (const member of [...outerMembers, ...innerMembers]) {
        if (member.geometry!.every((point) => includedRings.some((ring) => ring.some((vertex) => sameCoordinate(point, vertex))))) {
          memberWays.add(member.ref)
        }
      }
    })
  }

  for (const element of elements) {
    if (element.type !== 'way' || !isBuilding(element) || memberWays.has(element.id)) continue
    const id = `way/${element.id}`
    if (seen.has(id)) continue
    seen.add(id)
    const outer = validClosedRing(element.geometry)
    if (!outer) continue
    const tags = element.tags ?? {}
    buildings.push({ id, osmType: element.type, osmId: element.id, tags, outer, holes: [], height: buildingHeight(tags) })
  }
  return buildings
}
