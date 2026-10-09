import { PRESENCE_SPEED_LIMITS } from './movementLimits.ts'
import type { LocalCoordinate } from './geo.ts'

export const BUGGY_BODY = { radius: .92, halfLength: .9 }
export const BUGGY_IMPACT_MS = 1500
export interface BuggyBody extends LocalCoordinate { yaw: number }
export interface BuggyImpact {
  sequence: number; startedAt: number; until: number; strength: number
  velocity: LocalCoordinate; yawKick: number
  anchor: BuggyBody & { y: number; epoch: number }
}
export interface ReceivedBuggyImpact { impact: BuggyImpact; receivedAt: number; age: number }
const dot = (a: LocalCoordinate, b: LocalCoordinate) => a.x*b.x+a.z*b.z
const cross = (a: LocalCoordinate, b: LocalCoordinate) => a.x*b.z-a.z*b.x
const subtract = (a: LocalCoordinate, b: LocalCoordinate) => ({x:a.x-b.x,z:a.z-b.z})
const clamp = (n: number, lo: number, hi: number) => Math.max(lo,Math.min(hi,n))
export function boundedBuggyVelocity(v: LocalCoordinate): LocalCoordinate {
  const length=Math.hypot(v.x,v.z), scale=Math.min(1,PRESENCE_SPEED_LIMITS.buggy/(length||1))
  return {x:v.x*scale,z:v.z*scale}
}
function axis(p: BuggyBody) {
  const dx=Math.sin(p.yaw)*BUGGY_BODY.halfLength,dz=Math.cos(p.yaw)*BUGGY_BODY.halfLength
  return [{x:p.x-dx,z:p.z-dz},{x:p.x+dx,z:p.z+dz}]
}
function projection(p: LocalCoordinate,a: LocalCoordinate,b: LocalCoordinate) {
  const d=subtract(b,a),t=clamp(dot(subtract(p,a),d)/(dot(d,d)||1),0,1)
  return {x:a.x+d.x*t,z:a.z+d.z*t}
}
export function buggyContact(a: BuggyBody,b: BuggyBody) {
  const [a0,a1]=axis(a),[b0,b1]=axis(b),ad=subtract(a1,a0),bd=subtract(b1,b0),den=cross(ad,bd)
  const candidates=[{a:a0,b:projection(a0,b0,b1)},{a:a1,b:projection(a1,b0,b1)},{a:projection(b0,a0,a1),b:b0},{a:projection(b1,a0,a1),b:b1}]
  if(Math.abs(den)>1e-8) {
    const d=subtract(b0,a0),t=cross(d,bd)/den,u=cross(d,ad)/den
    if(t>=0&&t<=1&&u>=0&&u<=1) {const p={x:a0.x+ad.x*t,z:a0.z+ad.z*t};candidates.push({a:p,b:p})}
  }
  const best=candidates.reduce((best,p)=>Math.hypot(p.b.x-p.a.x,p.b.z-p.a.z)<Math.hypot(best.b.x-best.a.x,best.b.z-best.a.z)?p:best)
  const d=subtract(best.b,best.a),distance=Math.hypot(d.x,d.z),centres=subtract(b,a),length=Math.hypot(centres.x,centres.z)
  return {distance,normal:distance>1e-6?{x:d.x/distance,z:d.z/distance}:length>1e-6?{x:centres.x/length,z:centres.z/length}:{x:1,z:0},point:{x:(best.a.x+best.b.x)/2,z:(best.a.z+best.b.z)/2}}
}
// Scan the whole accepted movement, including heading changes, so a delayed
// sample cannot tunnel from one side of another buggy to the other.
export function sweptBuggyContact(previous: BuggyBody,current: BuggyBody,other: BuggyBody) {
  // Cheap conservative broad phase: most of a busy campus is far away. The
  // bound includes both capsule lengths and every intermediate orientation.
  const nearest = projection(other,previous,current)
  if(Math.hypot(other.x-nearest.x,other.z-nearest.z)>2*(BUGGY_BODY.radius+BUGGY_BODY.halfLength)+.04)return null
  const turn=Math.atan2(Math.sin(current.yaw-previous.yaw),Math.cos(current.yaw-previous.yaw))
  const steps=Math.min(256,Math.max(1,Math.ceil((Math.hypot(current.x-previous.x,current.z-previous.z)+Math.abs(turn)*BUGGY_BODY.halfLength)/.08)))
  for(let i=0;i<=steps;i++) {
    const t=i/steps,body={x:previous.x+(current.x-previous.x)*t,z:previous.z+(current.z-previous.z)*t,yaw:previous.yaw+turn*t}
    const contact=buggyContact(body,other)
    if(contact.distance<=BUGGY_BODY.radius*2+.04)return {...contact,body,t}
  }
  return null
}
export function solveBuggyImpact(a: BuggyBody,b: BuggyBody,velocityA: LocalCoordinate,velocityB: LocalCoordinate,normal=buggyContact(a,b).normal) {
  const va=boundedBuggyVelocity(velocityA),vb=boundedBuggyVelocity(velocityB),closing=dot(subtract(va,vb),normal)
  if(closing<.35)return null
  // Equal masses, modest restitution: transfer momentum without creating a
  // speed boost. A tangential hit retains its tangential velocity.
  const impulse=closing*1.35/2,strength=clamp(closing/12,0,1)
  const velocityAfterA=boundedBuggyVelocity({x:va.x-normal.x*impulse,z:va.z-normal.z*impulse})
  const velocityAfterB=boundedBuggyVelocity({x:vb.x+normal.x*impulse,z:vb.z+normal.z*impulse})
  const point=buggyContact(a,b).point
  return {strength,a:{velocity:velocityAfterA,yawKick:clamp(-cross(subtract(point,a),normal)*impulse*.055,-.55,.55)},b:{velocity:velocityAfterB,yawKick:clamp(cross(subtract(point,b),normal)*impulse*.055,-.55,.55)}}
}
export function parseBuggyImpact(value: unknown): BuggyImpact | null {
  if(!value||typeof value!=='object')return null
  const p=value as BuggyImpact,a=p.anchor,v=p.velocity
  if(!Number.isSafeInteger(p.sequence)||p.sequence<1||p.sequence>1e9||!Number.isFinite(p.startedAt)||p.startedAt<0||p.startedAt>1e14||p.until!==p.startedAt+BUGGY_IMPACT_MS||!Number.isFinite(p.strength)||p.strength<0||p.strength>1||!Number.isFinite(p.yawKick)||Math.abs(p.yawKick)>.55||!a||![a.x,a.y,a.z,a.yaw].every(Number.isFinite)||Math.abs(a.x)>1200||Math.abs(a.z)>1200||Math.abs(a.y)>64||Math.abs(a.yaw)>Math.PI+.001||!Number.isSafeInteger(a.epoch)||a.epoch<0||a.epoch>1e9||!v||![v.x,v.z].every(Number.isFinite)||Math.hypot(v.x,v.z)>PRESENCE_SPEED_LIMITS.buggy+1e-6)return null
  return {sequence:p.sequence,startedAt:p.startedAt,until:p.until,strength:p.strength,yawKick:p.yawKick,velocity:{x:v.x,z:v.z},anchor:{x:a.x,y:a.y,z:a.z,yaw:a.yaw,epoch:a.epoch}}
}
export function buggySuspension(strength: number,age: number) {
  const weight=age>=0&&age<1.5?strength*Math.exp(-age*7):0
  return {lift:Math.abs(Math.sin(age*24))*weight*.035,pitch:Math.sin(age*24)*weight*.045,roll:Math.sin(age*19)*weight*.025}
}

// Shared events may arrive directly and again in a snapshot. Keep ordering even
// after the render loop consumes an event; use server age, not the user's clock.
export class BuggyImpactInbox {
  private time = -Infinity
  private sequence = 0
  accept(value: unknown,serverTime: number,receivedAt: number): ReceivedBuggyImpact | null {
    const impact=parseBuggyImpact(value)
    if(!impact||!Number.isFinite(serverTime)||serverTime<impact.startedAt||serverTime>=impact.until||!Number.isFinite(receivedAt)||receivedAt<0||impact.startedAt<this.time||impact.startedAt===this.time&&impact.sequence<=this.sequence)return null
    this.time=impact.startedAt;this.sequence=impact.sequence
    return {impact,receivedAt,age:(serverTime-impact.startedAt)/1000}
  }
}
