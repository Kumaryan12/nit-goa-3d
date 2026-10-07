import { createFootballState, kickFootball, resetFootball, stepFootball } from '../src/lib/football.ts'
import type { FootballActor } from '../src/lib/football.ts'
import type { FootballPlayer, FootballSnapshot } from '../src/lib/footballProtocol.ts'
const pitch = { center: { x: 0, z: 0 }, rotation: 0, elevation: 0 }
const finite = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max
export function createFootballRoom() {
  const ball = createFootballState(), players = new Map<string, FootballPlayer>(), lastPose = new Map<string, number>(), lastMessage = new Map<string, number>()
  let number = 0, sequence = 0, resetAt = -Infinity
  const actor = (player: FootballPlayer): FootballActor => ({ position: { x: player.x, z: player.z }, direction: { x: player.dx, z: player.dz }, moving: player.moving, running: player.running, active: player.active })
  return {
    add(id: string, now = Date.now()): FootballPlayer | null {
      if (players.size >= 24 || players.has(id)) return null
      const blue = [...players.values()].filter(player => player.team === 'blue').length
      const player: FootballPlayer = { id, number: ++number, team: blue <= players.size - blue ? 'blue' : 'gold', x: -1.4, z: Math.ceil(players.size / 2) * .9 * (players.size % 2 ? 1 : -1), dx: 1, dz: 0, moving: false, running: false, active: true }
      players.set(id, player); lastPose.set(id, now); return { ...player }
    },
    remove(id: string) { players.delete(id); lastPose.delete(id); lastMessage.delete(id) },
    handle(id: string, value: unknown, now = Date.now()): boolean {
      const player = players.get(id)
      if (!player || !value || typeof value !== 'object') return false
      const message = value as Record<string, unknown>
      if (message.type === 'pose') {
        if (now - (lastMessage.get(id) ?? -Infinity) < 45 || !finite(message.x, 44) || !finite(message.z, 24) || !finite(message.dx, 1.01) || !finite(message.dz, 1.01) || typeof message.active !== 'boolean' || typeof message.running !== 'boolean') return false
        lastMessage.set(id, now)
        const distance = Math.hypot(message.x - player.x, message.z - player.z), elapsed = Math.min(.5, Math.max(0, (now - (lastPose.get(id) ?? now)) / 1000))
        if (distance > 8 * elapsed + .5) return false
        const length = Math.hypot(message.dx, message.dz)
        if (length < .9 || length > 1.1) return false
        player.x = message.x; player.z = message.z; player.dx = message.dx / length; player.dz = message.dz / length
        player.active = message.active; player.moving = message.active && distance > .015; player.running = message.running
        lastPose.set(id, now); return true
      }
      if (message.type === 'kick') return now - (lastPose.get(id) ?? 0) < 1000 && kickFootball(ball, actor(player), pitch)
      if (message.type === 'reset' && player.active && now - resetAt > 5000) { resetFootball(ball); resetAt = now; return true }
      return false
    },
    tick(delta: number, now = Date.now()) {
      for (const player of players.values()) {
        if (now - (lastPose.get(player.id) ?? 0) > 500) { player.moving = false; player.active = false }
        if (player.active && player.moving && Math.hypot(player.x - ball.x, player.z - ball.z) < .85) kickFootball(ball, actor(player), pitch, false)
      }
      stepFootball(ball, delta)
    },
    snapshot(): FootballSnapshot { return { type: 'state', sequence: ++sequence, serverTime: Date.now(), ball: { ...ball }, players: [...players.values()].map(player => ({ ...player })) } },
  }
}
