export const CAMPUS_LOADING_ENTRY_MS = 1150
export const CAMPUS_LOADING_EXIT_MS = 1000

export interface CampusStartupState {
  buildings: 'loading' | 'ready' | 'error'
  roads: 'loading' | 'ready' | 'error'
  terrain: boolean
  vegetation: boolean
  frame: boolean
  boundary: boolean
  unavailable: boolean
}
export function campusStartup(state: CampusStartupState) {
  const failed = state.buildings === 'error' || state.roads === 'error'
  const prepared = state.buildings !== 'loading' && state.roads !== 'loading' && state.terrain && state.vegetation
  const rendered = prepared && state.frame && state.boundary && !state.unavailable
  return {
    complete: rendered && !failed,
    canExplore: rendered && failed,
    phase: state.unavailable ? 'unavailable' : failed || prepared && state.frame && !state.boundary ? 'error' : state.buildings === 'loading' || state.roads === 'loading' ? 'map' : !state.terrain ? 'terrain' : !state.vegetation ? 'scenery' : !state.frame ? 'frame' : 'ready',
    stages: [state.buildings === 'ready' && state.roads === 'ready', state.terrain, state.vegetation, state.frame],
  }
}
export type CampusLoadingPhase = ReturnType<typeof campusStartup>['phase'] | 'opening'
