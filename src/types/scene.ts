export type WorldPosition = [number, number, number]

export interface SceneConfig {
  groundSize: number
  gridSpacing: number
  cameraPosition: WorldPosition
  cameraTarget: WorldPosition
  sunPosition: WorldPosition
  groundColor: string
  backgroundColor: string
}
