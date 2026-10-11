import { FOOTBALL_DRAG, FOOTBALL_GOAL_X, FOOTBALL_SIDE_Z, FOOTBALL_RADIUS } from './football.ts'
import type { FootballState } from './football.ts'
import type { FootballSnapshot } from './footballProtocol.ts'

interface Frame { time: number; ball: FootballState }
// The ball uses one short shared timeline rather than restarting prediction
// whenever a packet arrives. Reset revisions never interpolate across the pitch.
export class FootballMotionBuffer {
  private frames: Frame[] = []
  private offset: number | null = null
  private sequence = -1
  private receivedAt = 0
  push(snapshot: FootballSnapshot, now: number) {
    if (snapshot.sequence <= this.sequence) return
    const time = snapshot.serverTime ?? now, last = this.frames.at(-1)
    if (this.offset === null || now < this.receivedAt || now-this.receivedAt > 2000 || (last && time < last.time)) {
      this.frames = []; this.offset = now-time
    } else this.offset = Math.min(this.offset,now-time)
    if (last && ((last.ball.revision ?? 0) !== (snapshot.ball.revision ?? 0) || snapshot.ball.resetSeconds > 0 || Math.hypot(last.ball.x-snapshot.ball.x,last.ball.z-snapshot.ball.z) > 8)) this.frames = []
    const frame = { time, ball: { ...snapshot.ball } }
    if (this.frames.at(-1)?.time === time) this.frames[this.frames.length-1] = frame
    else this.frames.push(frame)
    this.frames = this.frames.slice(-8); this.sequence=snapshot.sequence; this.receivedAt=now
  }
  sample(now: number): { x: number; z: number; revision: number } | null {
    const latest=this.frames.at(-1)
    if (!latest || this.offset===null) return null
    const target=now-this.offset-75
    let a=this.frames[0]
    for(const frame of this.frames) if(frame.time<=target) a=frame
    const b=this.frames.find(frame=>frame.time>target)
    let x=a.ball.x,z=a.ball.z
    if(b && b!==a) {
      const t=Math.max(0,Math.min(1,(target-a.time)/(b.time-a.time)))
      x+=(b.ball.x-x)*t; z+=(b.ball.z-z)*t
    } else if(!b && !latest.ball.resetSeconds) {
      const dt=Math.max(0,Math.min(100,target-latest.time))/1000
      const travel=(1-Math.exp(-FOOTBALL_DRAG*dt))/FOOTBALL_DRAG
      x=latest.ball.x+latest.ball.vx*travel; z=latest.ball.z+latest.ball.vz*travel
      x=Math.max(-FOOTBALL_GOAL_X-FOOTBALL_RADIUS,Math.min(FOOTBALL_GOAL_X+FOOTBALL_RADIUS,x))
      z=Math.max(-FOOTBALL_SIDE_Z-FOOTBALL_RADIUS,Math.min(FOOTBALL_SIDE_Z+FOOTBALL_RADIUS,z))
    }
    return {x,z,revision:latest.ball.revision ?? 0}
  }
}

// Acknowledgements refer to an earlier transmitted position. Comparing that
// position directly with today's local avatar causes false rubber-banding.
export class FootballPoseProgress {
  private sequence = -1
  private progressedAt = 0
  observe(sequence: number | undefined, now: number) {
    if(sequence===undefined || sequence>this.sequence) {this.sequence=sequence ?? -1;this.progressedAt=now}
  }
  stalled(now: number) {return this.sequence>=0 && now-this.progressedAt>1500}
}
