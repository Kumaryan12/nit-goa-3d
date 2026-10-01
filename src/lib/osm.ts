import { extractBuildingFootprints, isBuilding } from './buildings.ts'
import { LAT0, LON0, validClosedRing } from './geo.ts'
import { extractCampusRoads } from './roads.ts'
import type { CampusMapData, CampusRoadData, GeoCoordinate, OSMResponse } from '../types/osm.ts'

// Override in .env.local to use another public or self-hosted Overpass instance.
export const OVERPASS_ENDPOINT = import.meta.env?.VITE_OVERPASS_ENDPOINT
  || 'https://overpass-api.de/api/interpreter'
export const CAMPUS_WAY_ID = 1259742369
export const FALLBACK_RADIUS_METERS = 900

export const CAMPUS_QUERY = `[out:json][timeout:30];
way(${CAMPUS_WAY_ID})->.campus;
.campus map_to_area -> .campusArea;
(
  .campus;
  way["building"](area.campusArea);
  relation["building"](area.campusArea);
);
out geom;`

export const FALLBACK_QUERY = `[out:json][timeout:30];
(
  way(${CAMPUS_WAY_ID});
  way["building"](around:${FALLBACK_RADIUS_METERS},${LAT0},${LON0});
  relation["building"](around:${FALLBACK_RADIUS_METERS},${LAT0},${LON0});
);
out geom;`

// highway=* includes service roads, footways, and paths. Fetch complete
// geometry, then clip centerlines to the actual campus boundary locally.
export const ROADS_QUERY = `[out:json][timeout:30];
way(${CAMPUS_WAY_ID})->.campus;
.campus map_to_area -> .campusArea;
(
  .campus;
  way["highway"](area.campusArea);
);
out geom;`

export const CAMPUS_BOUNDARY_QUERY = `[out:json][timeout:30];way(${CAMPUS_WAY_ID});out geom;`

export function campusRoadPolygonQuery(boundary: GeoCoordinate[]): string {
  const polygon = boundary.map(({ lat, lon }) => `${lat} ${lon}`).join(' ')
  return `[out:json][timeout:30];way["highway"](poly:"${polygon}");out geom;`
}

export async function requestOverpass(query: string, signal?: AbortSignal): Promise<OSMResponse> {
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  const timeout = setTimeout(() => controller.abort(new Error('Overpass request timed out after 45 seconds.')), 45000)
  if (signal?.aborted) cancel()
  signal?.addEventListener('abort', cancel, { once: true })

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Overpass HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }
    const data = await response.json() as OSMResponse
    if (!data || !Array.isArray(data.elements)) throw new Error('Overpass returned an invalid response.')
    if (data.remark) throw new Error(`Overpass: ${data.remark}`)
    // Queries return ways and relations; discard any unsupported or malformed records.
    data.elements = data.elements.filter((element) => element
      && (element.type === 'way' || element.type === 'relation') && Number.isSafeInteger(element.id))
    return data
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

function mapData(response: OSMResponse, source: CampusMapData['source']): CampusMapData {
  const campus = response.elements.find((element) => element.type === 'way' && element.id === CAMPUS_WAY_ID)
  return {
    buildings: extractBuildingFootprints(response.elements),
    returnedBuildingCount: response.elements.filter(isBuilding).length,
    source,
    boundary: campus?.type === 'way' ? validClosedRing(campus.geometry) : null,
  }
}

export async function fetchCampusData(signal?: AbortSignal): Promise<CampusMapData> {
  let areaError: unknown
  try {
    const campus = mapData(await requestOverpass(CAMPUS_QUERY, signal), 'campus-area')
    if (campus.buildings.length === 0) throw new Error('Campus-area query returned no usable building footprints.')
    return campus
  } catch (error) {
    if (signal?.aborted) throw error
    areaError = error
    console.warn('[NIT Goa OSM] Campus-area query failed; trying the 900 m fallback.', error)
  }

  try {
    const nearby = mapData(await requestOverpass(FALLBACK_QUERY, signal), 'nearby-fallback')
    if (nearby.buildings.length === 0) throw new Error('The 900 m fallback returned no usable building footprints.')
    return nearby
  } catch (error) {
    if (signal?.aborted) throw error
    throw new AggregateError([areaError, error], 'Both NIT Goa Overpass queries failed.')
  }
}

function campusBoundary(response: OSMResponse): GeoCoordinate[] | null {
  const campus = response.elements.find((element) => element.type === 'way' && element.id === CAMPUS_WAY_ID)
  return campus?.type === 'way' ? validClosedRing(campus.geometry) : null
}

function roadData(response: OSMResponse, boundary: GeoCoordinate[], source: CampusRoadData['source']): CampusRoadData {
  return {
    roads: extractCampusRoads(response.elements, boundary),
    returnedRoadCount: response.elements.filter((element) => element.type === 'way' && element.tags?.highway).length,
    source,
    boundary,
  }
}

// Loading roads is independent of buildings: failure never discards loaded
// building geometry or selection. The fallback stays within the campus polygon.
export async function fetchCampusRoads(signal?: AbortSignal): Promise<CampusRoadData> {
  let boundary: GeoCoordinate[] | null = null
  let areaError: unknown
  try {
    const response = await requestOverpass(ROADS_QUERY, signal)
    boundary = campusBoundary(response)
    if (!boundary) throw new Error('Overpass did not return a valid NIT Goa campus boundary.')
    const data = roadData(response, boundary, 'campus-area')
    if (data.roads.length > 0) return data
    throw new Error('Campus-area query returned no roads; checking the campus polygon.')
  } catch (error) {
    if (signal?.aborted) throw error
    areaError = error
    console.warn('[NIT Goa OSM] Road area query failed; trying the campus polygon.', error)
  }
  try {
    boundary ??= campusBoundary(await requestOverpass(CAMPUS_BOUNDARY_QUERY, signal))
    if (!boundary) throw new Error('Campus roads cannot be bounded without the campus boundary.')
    return roadData(await requestOverpass(campusRoadPolygonQuery(boundary), signal), boundary, 'campus-polygon')
  } catch (error) {
    if (signal?.aborted) throw error
    throw new AggregateError([areaError, error], 'Unable to load OpenStreetMap campus roads.')
  }
}
