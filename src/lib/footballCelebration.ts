import type { FootballState } from './football.ts'

export const GOAL_CELEBRATION_SECONDS = 2.5
export interface GoalCelebration { key:string; team:'blue'|'gold'; blue:number; gold:number; startedAt:number; expiresAt:number }

// Keep the score identity across socket reconnects. Repeated countdown packets
// can shorten a celebration, but never restart it or extend its deadline.
export class FootballGoalCelebrations {
  private seen = ''
  private scores = { blue:0, gold:0 }
  private active:GoalCelebration|null = null
  observe(ball:FootballState, now:number) {
    if(ball.blue<this.scores.blue || ball.gold<this.scores.gold) this.seen=''
    this.scores={blue:ball.blue,gold:ball.gold}
    const team=ball.event==='blue-goal'?'blue':ball.event==='gold-goal'?'gold':null
    if(!team || ball.resetSeconds<=0) {this.active=null;return}
    const key=`${ball.blue}:${ball.gold}`
    const remaining=Math.min(GOAL_CELEBRATION_SECONDS,ball.resetSeconds)*1000
    if(key!==this.seen) {
      this.seen=key
      this.active={key,team,blue:ball.blue,gold:ball.gold,startedAt:now-(GOAL_CELEBRATION_SECONDS*1000-remaining),expiresAt:now+remaining}
    } else if(this.active) this.active.expiresAt=Math.min(this.active.expiresAt,now+remaining)
  }
  sample(now:number) {
    if(this.active && now>=this.active.expiresAt) this.active=null
    return this.active
  }
  hide() {this.active=null}
}

// Analytical trajectories use no per-frame randomness, physics bodies or
// allocations; clients see the same burst shape at the shared countdown age.
export function goalConfetti(index:number, age:number, target:{x:number;y:number;z:number;spin:number;visible:boolean}) {
  const hash=(n:number)=>{const value=Math.sin((index+1)*127.1+n*311.7)*43758.5453;return value-Math.floor(value)}
  const angle=hash(1)*Math.PI*2, spread=1.5+hash(2)*3
  target.x=Math.cos(angle)*spread*age
  target.z=Math.sin(angle)*spread*age
  target.y=.5+(5+hash(3)*3)*age-4*age*age
  target.spin=hash(4)*Math.PI*2+age*(3+hash(5)*6)
  target.visible=age>=0 && age<GOAL_CELEBRATION_SECONDS && target.y>.15
  return target
}
