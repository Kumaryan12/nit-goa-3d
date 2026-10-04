import type { LocalCoordinate } from './geo.ts'
import type { CampusLocation } from '../types/campus.ts'

// Match the existing painted pitch and goal posts in POIObjects.
export const FOOTBALL_RADIUS = 0.28
export const FOOTBALL_GOAL_X = 42
export const FOOTBALL_SIDE_Z = 22
export const FOOTBALL_GOAL_HALF_WIDTH = 3.6
export interface FootballPitch { center: LocalCoordinate; rotation: number; elevation: number }
export interface FootballState {
  x: number; z: number; vx: number; vz: number
  blue: number; gold: number; resetSeconds: number
  event: 'kickoff' | 'playing' | 'blue-goal' | 'gold-goal' | 'out'; kickCooldown: number
}
export interface FootballActor { position: LocalCoordinate; direction: LocalCoordinate; moving: boolean; running: boolean; active: boolean }
export interface FootballControls { kick: number; reset: number; actor: FootballActor | null }
export interface FootballStatus { blue: number; gold: number; canKick: boolean; onPitch: boolean; distance: number; event: FootballState['event']; countdown: number }
export const createFootballControls = (): FootballControls => ({ kick: 0, reset: 0, actor: null })
export const createFootballState = (): FootballState => ({ x: 0, z: 0, vx: 0, vz: 0, blue: 0, gold: 0, resetSeconds: 0, event: 'kickoff', kickCooldown: 0 })
export function footballPitch(location: CampusLocation): FootballPitch {
  return { center: { ...location.coordinates }, rotation: (location.rotationDegrees ?? 0) * Math.PI / 180, elevation: location.elevation ?? 0 }
}
export function footballToWorld(point: LocalCoordinate, pitch: FootballPitch): LocalCoordinate {
  const c = Math.cos(pitch.rotation), s = Math.sin(pitch.rotation)
  return { x: pitch.center.x + point.x * c + point.z * s, z: pitch.center.z - point.x * s + point.z * c }
}
export function footballToLocal(point: LocalCoordinate, pitch: FootballPitch): LocalCoordinate {
  const x = point.x - pitch.center.x, z = point.z - pitch.center.z, c = Math.cos(pitch.rotation), s = Math.sin(pitch.rotation)
  return { x: x * c - z * s, z: x * s + z * c }
}
export function footballStatus(state: FootballState, actor: FootballActor | null, pitch: FootballPitch): FootballStatus {
  const point = actor ? footballToLocal(actor.position, pitch) : null
  const distance = point ? Math.hypot(point.x - state.x, point.z - state.z) : Infinity
  const onPitch = !!actor?.active && !!point && Math.abs(point.x) <= 46 && Math.abs(point.z) <= 26
  return { blue: state.blue, gold: state.gold, onPitch, distance, canKick: onPitch && distance <= 1.8 && state.resetSeconds === 0, event: state.event, countdown: Math.ceil(state.resetSeconds) }
}
export function kickFootball(state: FootballState, actor: FootballActor | null, pitch: FootballPitch, shot = true): boolean {
  if (!actor || !footballStatus(state, actor, pitch).canKick || state.kickCooldown > 0) return false
  const length = Math.hypot(actor.direction.x, actor.direction.z)
  if (!Number.isFinite(length) || length < .001) return false
  const c = Math.cos(pitch.rotation), s = Math.sin(pitch.rotation)
  const dx = (actor.direction.x * c - actor.direction.z * s) / length, dz = (actor.direction.x * s + actor.direction.z * c) / length
  const power = shot ? actor.running ? 30 : 22 : actor.running ? 7 : 4
  state.vx = dx * power; state.vz = dz * power; state.event = 'playing'; state.kickCooldown = shot ? .25 : .16
  return true
}
export function resetFootball(state: FootballState, scores = false): void {
  state.x = 0; state.z = 0; state.vx = 0; state.vz = 0; state.resetSeconds = 0; state.kickCooldown = 0; state.event = 'kickoff'
  if (scores) { state.blue = 0; state.gold = 0 }
}
// Swept goal-line detection and bounded substeps make fast shots frame-rate safe.
export function stepFootball(state: FootballState, delta: number): void {
  if (!Number.isFinite(delta) || delta <= 0) return
  const dt = Math.min(.1, delta)
  state.kickCooldown = Math.max(0, state.kickCooldown - dt)
  if (state.resetSeconds > 0) {
    state.resetSeconds = Math.max(0, state.resetSeconds - dt)
    if (!state.resetSeconds) resetFootball(state)
    return
  }
  const steps = Math.max(1, Math.ceil(Math.hypot(state.vx, state.vz) * dt / .15)), step = dt / steps
  for (let i = 0; i < steps; i++) {
    const beforeX = state.x, beforeZ = state.z
    state.x += state.vx * step; state.z += state.vz * step
    state.vx *= Math.exp(-.65 * step); state.vz *= Math.exp(-.65 * step)
    for (const goal of [-1, 1]) {
      const line = goal * (FOOTBALL_GOAL_X + FOOTBALL_RADIUS)
      if (goal * beforeX < goal * line && goal * state.x >= goal * line) {
        const z = beforeZ + (state.z - beforeZ) * (line - beforeX) / (state.x - beforeX)
        if (Math.abs(z) < FOOTBALL_GOAL_HALF_WIDTH - FOOTBALL_RADIUS) {
          state.x = goal * 43.2; state.z = z; state.vx = 0; state.vz = 0
          if (goal > 0) state.blue++; else state.gold++
          state.event = goal > 0 ? 'blue-goal' : 'gold-goal'; state.resetSeconds = 2.5; return
        }
      }
      // Goal posts are solid, including shots that just miss the opening.
      for (const z of [-FOOTBALL_GOAL_HALF_WIDTH, FOOTBALL_GOAL_HALF_WIDTH]) {
        const dx = state.x - goal * FOOTBALL_GOAL_X, dz = state.z - z, distance = Math.hypot(dx, dz), radius = FOOTBALL_RADIUS + .11
        if (distance < radius && distance > 1e-6) {
          const nx = dx / distance, nz = dz / distance, toward = state.vx * nx + state.vz * nz
          state.x = goal * FOOTBALL_GOAL_X + nx * radius; state.z = z + nz * radius
          if (toward < 0) { state.vx -= 1.6 * toward * nx; state.vz -= 1.6 * toward * nz }
        }
      }
    }
    if (Math.abs(state.x) > FOOTBALL_GOAL_X + FOOTBALL_RADIUS || Math.abs(state.z) > FOOTBALL_SIDE_Z + FOOTBALL_RADIUS) {
      state.vx = 0; state.vz = 0; state.event = 'out'; state.resetSeconds = 1.5; return
    }
  }
  if (Math.hypot(state.vx, state.vz) < .08) { state.vx = 0; state.vz = 0 }
}
