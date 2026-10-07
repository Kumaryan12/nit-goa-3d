export type GraphicsMode = 'auto' | 'smooth' | 'detailed'
export interface GraphicsProfile { dpr: number; shadowSize: number; detailDistance: number; shadowRate: number }
export const GRAPHICS_PROFILES: GraphicsProfile[] = [
  { dpr: .85, shadowSize: 1024, detailDistance: 120, shadowRate: 10 },
  { dpr: 1.15, shadowSize: 1536, detailDistance: 200, shadowRate: 15 },
  { dpr: 1.5, shadowSize: 2048, detailDistance: 320, shadowRate: 20 },
]
export const MOBILE_RECOVERY_PROFILE: GraphicsProfile = { dpr: .65, shadowSize: 512, detailDistance: 90, shadowRate: 6 }
export const validGraphicsMode = (value: unknown): GraphicsMode => value === 'smooth' || value === 'detailed' ? value : 'auto'
export interface GraphicsAdaptation { level: number; slow: number; fast: number; cooldown: number }
export const initialGraphics = (compact: boolean): GraphicsAdaptation => ({ level: compact ? 0 : 1, slow: 0, fast: 0, cooldown: 0 })

// Sustained evidence and a cooldown avoid changing quality on a loading frame
// or repeatedly resizing render targets while the camera is moving.
export function adaptGraphics(state: GraphicsAdaptation, fps: number, seconds: number, compact: boolean): GraphicsAdaptation {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3) return state
  const cooldown = Math.max(0, state.cooldown - seconds), maxLevel = compact ? 0 : 2, minLevel = compact ? -1 : 0
  if (state.cooldown > 0) return { ...state, cooldown, slow: 0, fast: 0 }
  const slow = fps < 42 ? state.slow + seconds : 0, fast = fps >= 56 ? state.fast + seconds : 0
  if (slow >= 4 && state.level > minLevel) return { level: state.level - 1, slow: 0, fast: 0, cooldown: 16 }
  if (fast >= 12 && state.level < maxLevel) return { level: state.level + 1, slow: 0, fast: 0, cooldown: 16 }
  return { ...state, cooldown, slow, fast }
}

export function graphicsProfile(mode: GraphicsMode, level: number): GraphicsProfile {
  if (mode === 'smooth') return GRAPHICS_PROFILES[0]
  if (mode === 'detailed') return { ...GRAPHICS_PROFILES[2], detailDistance: Infinity }
  if (level < 0) return MOBILE_RECOVERY_PROFILE
  return GRAPHICS_PROFILES[Math.max(0, Math.min(2, level))]
}

export function detailVisible(camera: { x: number; y: number; z: number }, center: readonly number[], radius: number, distance: number, previous: boolean, selected = false): boolean {
  if (selected || distance === Infinity) return true
  const edge = Math.hypot(camera.x - center[0], camera.y - center[1], camera.z - center[2]) - radius
  return edge <= distance + (previous ? 20 : 0)
}
