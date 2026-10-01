export const LABEL_FADE_START = 850
export const LABEL_HIDE_DISTANCE = 1400

export function labelOpacity(distance: number, inFront = true): number {
  if (!inFront || !Number.isFinite(distance) || distance < 0 || distance >= LABEL_HIDE_DISTANCE) return 0
  const t = Math.max(0, Math.min(1, (distance - LABEL_FADE_START) / (LABEL_HIDE_DISTANCE - LABEL_FADE_START)))
  return 1 - t * t * (3 - 2 * t)
}

export function fadeLabel(current: number, target: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, delta) * 8))
}
