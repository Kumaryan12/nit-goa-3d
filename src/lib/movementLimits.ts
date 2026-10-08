// Shared caps keep the local controls, remote animation and live validation in sync.
export const MOVEMENT_SPEEDS = { walk: 2.5, run: 5, bicycle: 7, buggy: 9 } as const
export const PRESENCE_SPEED_LIMITS = {
  walk: 5.8,
  bicycle: MOVEMENT_SPEEDS.bicycle + .6,
  buggy: MOVEMENT_SPEEDS.buggy + .6,
} as const

export function presenceSpeedLimit(pose: { vehicle?: string; space: string }, activity: unknown) {
  if (pose.space === 'outdoors' && activity === 'walk' && (pose.vehicle === 'bicycle' || pose.vehicle === 'buggy')) return PRESENCE_SPEED_LIMITS[pose.vehicle]
  return PRESENCE_SPEED_LIMITS.walk
}

// A short transport delay must not turn valid travel into a position correction.
// Keep a bounded catch-up window and the same speed caps used by the controls.
export const PRESENCE_CATCHUP_SECONDS = 2
export function presenceVerticalSpeedLimit(pose: { vehicle?: string; space: string }, activity: unknown) {
  return Math.max(6, presenceSpeedLimit(pose, activity) * .85 + 1)
}
