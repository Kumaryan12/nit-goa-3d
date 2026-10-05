import { createDigitalTwin } from './digitalTwin.ts'
import type { DigitalTwin } from './digitalTwin.ts'
import { createTerrainPatches } from './terrainPatches.ts'
import { createHostelPlan, createGyanMandirPlan, GYAN_MANDIR_ID } from './hostelInterior.ts'
import { createWalkWorld, isWalkable } from './walking.ts'
import type { CampusOverrides } from './locationOverrides.ts'
import type { CampusMapData, CampusRoadData } from '../types/osm.ts'
import type { TerrainSettings } from '../data/topography.ts'

export interface TwinBuildRequest { id: number; map: CampusMapData | null; roads: CampusRoadData | null; settled: boolean; overrides: CampusOverrides; terrainSettings: TerrainSettings }
export type TwinBuildReply = { id: number; twin: DigitalTwin } | { id: number; error: string }

export function prepareDigitalTwin(request: TwinBuildRequest): DigitalTwin {
  const twin: DigitalTwin = createDigitalTwin(request.map, request.roads, request.settled, request.overrides, request.terrainSettings)
  twin.terrainPatches = createTerrainPatches(twin.terrain)
  const world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps)
  const safe = (point: { x: number; z: number }) => isWalkable(point, world)
  const hostel = twin.buildings[twin.selections.findIndex(s => s.location.id === 'boys-hostel')]
  const gyan = twin.buildings[twin.selections.findIndex(s => s.location.id === GYAN_MANDIR_ID)]
  twin.interiors = {
    hostel: hostel ? createHostelPlan(hostel, twin.roads, safe) : null,
    gyan: gyan ? createGyanMandirPlan(gyan, twin.roads, safe, twin.selections.find(s => s.location.id === 'way/1423803680')?.location.coordinates) : null,
  }
  return twin
}

export function twinTransferBuffers(twin: DigitalTwin): ArrayBuffer[] {
  return [twin.terrain.heights.buffer as ArrayBuffer, twin.terrain.colors.buffer as ArrayBuffer,
    ...twin.terrainPatches!.flatMap(p => [p.positions.buffer, p.normals.buffer, p.colors.buffer, p.indices.buffer] as ArrayBuffer[])]
}
