import type { SceneConfig } from '../types/scene'

// One world unit is approximately one meter. Y is up; the ground lies on X/Z.
export const sceneConfig: SceneConfig = {
  groundSize: 400,
  gridSpacing: 5,
  cameraPosition: [110, 110, 110],
  cameraTarget: [0, 0, 0],
  sunPosition: [120, 180, 80],
  groundColor: '#e5dfcc',
  backgroundColor: '#dce7ec',
}
