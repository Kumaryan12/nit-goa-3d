export interface GeoCoordinate {
  lat: number
  lon: number
}

export type OSMTags = Record<string, string>

export interface OSMWay {
  type: 'way'
  id: number
  tags?: OSMTags
  geometry?: GeoCoordinate[]
}

export interface OSMRelationMember {
  type: 'node' | 'way' | 'relation'
  ref: number
  role: string
  geometry?: GeoCoordinate[]
}

export interface OSMRelation {
  type: 'relation'
  id: number
  tags?: OSMTags
  members?: OSMRelationMember[]
}

export type OSMElement = OSMWay | OSMRelation

export interface OSMResponse {
  elements: OSMElement[]
  remark?: string
}

export interface BuildingFootprint {
  id: string
  osmType: OSMElement['type']
  osmId: number
  tags: OSMTags
  outer: GeoCoordinate[]
  holes: GeoCoordinate[][]
  height: number
}

export interface CampusMapData {
  buildings: BuildingFootprint[]
  returnedBuildingCount: number
  source: 'campus-area' | 'nearby-fallback'
  boundary: GeoCoordinate[] | null
}

export type CampusMapState =
  | { status: 'loading' }
  | { status: 'ready'; data: CampusMapData }
  | { status: 'error' }

export interface RoadFootprint {
  id: string
  osmId: number
  tags: OSMTags
  kind: 'road' | 'footpath'
  width: number
  paths: { x: number; z: number }[][]
}

export interface CampusRoadData {
  roads: RoadFootprint[]
  returnedRoadCount: number
  source: 'campus-area' | 'campus-polygon'
  boundary: GeoCoordinate[]
}

export type CampusRoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: CampusRoadData }
  | { status: 'error' }
