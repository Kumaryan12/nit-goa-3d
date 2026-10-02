import type { DigitalTwin } from './digitalTwin.ts'

export interface CampusStatistics { buildings: number; roads: number; roadSegments: number; footpaths: number; trees: number }
export function calculateCampusStats(twin: DigitalTwin | null): CampusStatistics {
  return {
    buildings: twin?.buildings.length ?? 0,
    roads: twin?.roads.length ?? 0,
    roadSegments: twin?.roads.reduce((count, road) => count + road.paths.reduce((sum, path) => sum + Math.max(0, path.length - 1), 0), 0) ?? 0,
    footpaths: twin?.roads.filter((road) => road.kind === 'footpath').length ?? 0,
    trees: twin?.vegetationReady ? twin.trees.length : 0,
  }
}
