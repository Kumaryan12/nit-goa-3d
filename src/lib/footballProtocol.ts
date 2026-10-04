import type { FootballState } from './football.ts'
export interface FootballPlayer { id: string; number: number; team: 'blue' | 'gold'; x: number; z: number; dx: number; dz: number; moving: boolean; running: boolean; active: boolean }
export interface FootballSnapshot { type: 'state'; sequence: number; ball: FootballState; players: FootballPlayer[] }
export interface FootballSession { id: string | null; snapshot: FootballSnapshot | null }
const finite = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max
export function parseFootballSnapshot(value: unknown): FootballSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const data = value as FootballSnapshot, ball = data.ball
  if (data.type !== 'state' || !Number.isSafeInteger(data.sequence) || data.sequence < 0 || !ball || !Array.isArray(data.players) || data.players.length > 24) return null
  if (![ball.x, ball.z].every(value => finite(value, 60)) || ![ball.vx, ball.vz].every(value => finite(value, 40)) || ![ball.blue, ball.gold].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1e6) || !finite(ball.resetSeconds, 3) || ball.resetSeconds < 0 || !finite(ball.kickCooldown, 1) || !['kickoff','playing','blue-goal','gold-goal','out'].includes(ball.event)) return null
  const ids = new Set<string>()
  for (const player of data.players) {
    if (!player || typeof player.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(player.id) || ids.has(player.id) || !Number.isInteger(player.number) || player.number < 1 || !['blue','gold'].includes(player.team) || ![player.x,player.z].every(value => finite(value, 50)) || ![player.dx,player.dz].every(value => finite(value, 1.01)) || ![player.moving,player.running,player.active].every(value => typeof value === 'boolean')) return null
    ids.add(player.id)
  }
  return data
}
