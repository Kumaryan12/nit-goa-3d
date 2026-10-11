import { createFootballState, dribbleFootball, footballStatus, kickFootball, resetFootball, stepFootball } from '../src/lib/football.ts'
import type { FootballAction, FootballActor } from '../src/lib/football.ts'
import type { FootballPlayer, FootballSnapshot } from '../src/lib/footballProtocol.ts'
import { PRESENCE_SPEED_LIMITS, PRESENCE_CATCHUP_SECONDS } from '../src/lib/movementLimits.ts'
const pitch = { center: { x: 0, z: 0 }, rotation: 0, elevation: 0 }
const finite = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max
export function createFootballRoom() {
  const ball = createFootballState(), players = new Map<string, FootballPlayer>(), lastPose = new Map<string, number>(), lastMessage = new Map<string, number>()
  const pending = new Map<string,{mode:FootballAction;expires:number}>(), lastKick = new Map<string,number>(), speeds=new Map<string,number>(), spawnSlots=new Map<string,number>()
  let number = 0, sequence = 0, resetAt = -Infinity
  const actor = (player: FootballPlayer): FootballActor => ({ position: { x: player.x, z: player.z }, direction: { x: player.dx, z: player.dz }, speed:speeds.get(player.id) ?? 0, moving: player.moving, running: player.running, active: player.active })
  const shoot = (player: FootballPlayer, mode: FootballAction) => {
    if(!kickFootball(ball,actor(player),pitch,mode)) return false
    player.kick=(player.kick ?? 0)+1; pending.delete(player.id); return true
  }
  return {
    add(id: string, now = Date.now()): FootballPlayer | null {
      if (players.size >= 24 || players.has(id)) return null
      const blue = [...players.values()].filter(player => player.team === 'blue').length
      const team=blue <= players.size-blue ? 'blue' : 'gold', side=team==='blue'?-1:1
      const occupied=new Set([...players.values()].filter(p=>p.team===team).map(p=>spawnSlots.get(p.id)))
      const count=Array.from({length:24},(_,i)=>i).find(i=>!occupied.has(i))!
      spawnSlots.set(id,count)
      const player: FootballPlayer = { id, number: ++number, team, x: side*(1.4+Math.floor(count/6)*1.4), z: count ? Math.ceil(count/2)*1.5*(count%2?1:-1) : 0, dx: -side, dz: 0, moving: false, running: false, active: true, poseSequence:0, kick:0 }
      players.set(id, player); lastPose.set(id, now); return { ...player }
    },
    remove(id: string) { players.delete(id); lastPose.delete(id); lastMessage.delete(id); pending.delete(id); lastKick.delete(id); speeds.delete(id); spawnSlots.delete(id) },
    handle(id: string, value: unknown, now = Date.now()): boolean {
      const player = players.get(id)
      if (!player || !value || typeof value !== 'object') return false
      const message = value as Record<string, unknown>
      if (message.type === 'pose') {
        if(message.sequence !== undefined && (!Number.isSafeInteger(message.sequence) || (message.sequence as number) <= (player.poseSequence ?? 0))) return false
        if (now - (lastMessage.get(id) ?? -Infinity) < 45 || !finite(message.x, 44) || !finite(message.z, 24) || !finite(message.dx, 1.01) || !finite(message.dz, 1.01) || typeof message.active !== 'boolean' || typeof message.running !== 'boolean') return false
        lastMessage.set(id, now)
        const distance = Math.hypot(message.x - player.x, message.z - player.z), elapsed = Math.min(PRESENCE_CATCHUP_SECONDS, Math.max(0, (now - (lastPose.get(id) ?? now)) / 1000))
        if (distance > PRESENCE_SPEED_LIMITS.walk * elapsed + .35) return false
        const length = Math.hypot(message.dx, message.dz)
        if (length < .9 || length > 1.1) return false
        player.x = message.x; player.z = message.z; player.dx = message.dx / length; player.dz = message.dz / length
        player.active = message.active; player.moving = message.active && distance > .015; player.running = message.running
        speeds.set(id,elapsed>0?Math.min(PRESENCE_SPEED_LIMITS.walk,distance/elapsed):0)
        if(message.sequence !== undefined) player.poseSequence=message.sequence as number
        if(!player.active) pending.delete(id)
        lastPose.set(id, now); return true
      }
      if (message.type === 'kick') {
        if(now-(lastPose.get(id) ?? 0)>=500 || !player.active || now-(lastKick.get(id) ?? -Infinity)<90 || (message.mode !== undefined && message.mode !== 'shot' && message.mode !== 'pass')) return false
        if(message.running !== undefined && typeof message.running!=='boolean') return false
        let dx=player.dx,dz=player.dz
        if(message.dx !== undefined || message.dz !== undefined) {
          if(!finite(message.dx,1.01) || !finite(message.dz,1.01)) return false
          const length=Math.hypot(message.dx,message.dz)
          if(length<.9 || length>1.1) return false
          dx=message.dx/length;dz=message.dz/length
        }
        const status=footballStatus(ball,actor(player),pitch)
        if(!status.onPitch || status.distance>2.6 || ball.resetSeconds>0) return false
        player.dx=dx;player.dz=dz
        if(typeof message.running==='boolean') player.running=message.running
        lastKick.set(id,now)
        const mode=message.mode==='pass'?'pass':'shot'
        if(shoot(player,mode)) return true
        pending.set(id,{mode,expires:now+180}); return true
      }
      if (message.type === 'reset' && player.active && now-(lastPose.get(id) ?? 0)<500 && now - resetAt > 5000) { resetFootball(ball); pending.clear(); resetAt = now; return true }
      return false
    },
    tick(delta: number, now = Date.now()) {
      for (const player of players.values()) {
        if (now - (lastPose.get(player.id) ?? 0) > 500) { player.moving = false; player.active = false; pending.delete(player.id) }
      }
      for(const [id,request] of pending) {
        const player=players.get(id)
        if(!player || !player.active || now>request.expires || ball.resetSeconds>0) pending.delete(id)
        else shoot(player,request.mode)
      }
      // Resolve one touch per tick, closest first, independent of join order.
      const candidates=[...players.values()].filter(p=>p.active&&p.moving).sort((a,b)=>Math.hypot(a.x-ball.x,a.z-ball.z)-Math.hypot(b.x-ball.x,b.z-ball.z)||a.id.localeCompare(b.id))
      for(const player of candidates) if(dribbleFootball(ball,actor(player),pitch,delta)) break
      stepFootball(ball, delta)
    },
    snapshot(): FootballSnapshot { return { type: 'state', sequence: ++sequence, serverTime: Date.now(), ball: { ...ball }, players: [...players.values()].map(player => ({ ...player })) } },
  }
}
