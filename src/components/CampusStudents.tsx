import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import type { DigitalTwin } from '../lib/digitalTwin'
import type { CampusPose, CampusSession } from '../lib/campusProtocol'
import type { StudentPlan } from '../lib/campusStudents'
import type { StudentState } from '../lib/studentBehaviour'
import type { AvatarMotion } from '../lib/avatarMotion'
import { createWalkWorld } from '../lib/walking'
import { advanceStudent, freshStudent, studentDetailBudget } from '../lib/studentBehaviour'
import StudentAvatar from './StudentAvatar'
import CrowdAvatar from './CrowdAvatar'
import { GraphicsContext } from './ScenePerformance'
import './campus-students.css'

function Student({ plan, state, detailed, label }: { plan: StudentPlan; state: StudentState; detailed: boolean; label: boolean }) {
  const root = useRef<Group>(null), caption = useRef<HTMLSpanElement>(null), bubble = useRef<HTMLSpanElement>(null)
  const motion = useRef<AvatarMotion>({ phase: state.phase, moving: false }), snapped = useRef(false)
  const [seated, setSeated] = useState(state.seated)
  useFrame((_, delta) => {
    if (!root.current) return
    const dt = Math.min(.1, delta), blend = 1 - Math.exp(-dt * 18)
    if (!snapped.current) { root.current.position.set(state.x, state.y, state.z); root.current.rotation.y = state.yaw; snapped.current = true }
    else { root.current.position.x += (state.x - root.current.position.x) * blend; root.current.position.z += (state.z - root.current.position.z) * blend; root.current.position.y += (state.y - root.current.position.y) * blend }
    root.current.rotation.y += Math.atan2(Math.sin(state.yaw - root.current.rotation.y), Math.cos(state.yaw - root.current.rotation.y)) * (1 - Math.exp(-dt * 8))
    root.current.visible = state.visible
    Object.assign(motion.current, { moving: state.moving, speed: state.speed, phase: state.phase, social: state.social, seated: state.seated, talking: state.talking, paused: !state.visible })
    if (seated !== state.seated) setSeated(state.seated)
    if (caption.current?.parentElement) caption.current.parentElement.hidden = !state.visible
    if (caption.current) caption.current.textContent = `${plan.name} · NPC`
    if (bubble.current) { bubble.current.hidden = !state.message; if (bubble.current.textContent !== state.message) bubble.current.textContent = state.message }
  })
  return <group ref={root} name="ambient-npc-student">
    {detailed ? <StudentAvatar style={plan.style} motion={motion} jersey={plan.color} /> : <CrowdAvatar style={plan.style} motion={motion} color={plan.color} seated={seated} seatHeight={seated ? plan.seat?.seatHeight : undefined} />}
    {label && <Html center position={[0, 2.22, 0]} distanceFactor={11} zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}><div className="npc-caption" aria-hidden="true"><span className="npc-speech" ref={bubble} hidden /><span ref={caption} className="npc-name">{plan.name} · NPC</span></div></Html>}
  </group>
}

/** Decorative students never enter real presence, voice, collision or photo identities. */
function CampusStudents({ twin, session, localPose, walking, outdoors, busy = false }: { twin: DigitalTwin; session: React.RefObject<CampusSession>; localPose: React.RefObject<CampusPose | null>; walking: boolean; outdoors: boolean; busy?: boolean }) {
  const profile = useContext(GraphicsContext), npcProfile = useMemo(() => ({ ...profile, avatarShadows: false }), [profile])
  const world = useMemo(() => createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps), [twin])
  const agents = useMemo(() => (twin.students ?? []).map(plan => ({ plan, state: freshStudent(plan, world) })), [twin, world])
  const elapsed = useRef(0), selectionElapsed = useRef(1), selectionKey = useRef(''), [choices, setChoices] = useState<{ id: string; detailed: boolean; label: boolean }[]>([])
  useEffect(() => { selectionElapsed.current = 1; selectionKey.current = ''; setChoices([]) }, [agents])
  useFrame(({ camera }, delta) => {
    if (!outdoors || document.hidden) return
    elapsed.current += Math.min(.1, delta); selectionElapsed.current += Math.min(.1, delta)
    const current = session.current, people = current.snapshot?.people ?? [], local = walking ? localPose.current : null
    if (elapsed.current >= .1) {
      elapsed.current %= .1
      const poses = people.flatMap(p => p.id !== current.id && p.pose ? [p.pose] : []); if (local) poses.push(local)
      const self = people.find(p => p.id === current.id)
      const responders = new Set(local ? [...agents].filter(a => a.state.visible && Math.abs(a.state.y - local.y) < 2).sort((a, b) => Math.hypot(a.state.x - local.x, a.state.z - local.z) - Math.hypot(b.state.x - local.x, b.state.z - local.z)).slice(0, 2).map(a => a.plan.id) : [])
      const now = Date.now()
      for (const agent of agents) advanceStudent(agent.state, agent.plan, world, .1, now, { pose: local, social: self?.social }, poses, responders.has(agent.plan.id))
    }
    if (selectionElapsed.current < .4) return
    selectionElapsed.current = 0
    const nearbyReal = people.filter(p => p.id !== current.id && p.pose?.visible && p.pose.space === 'outdoors' && Math.hypot(p.pose.x - camera.position.x, p.pose.z - camera.position.z) < 60).length
    const detail = busy ? 0 : studentDetailBudget(profile.dpr, nearbyReal), radius = busy ? 55 : walking ? 140 : 1100
    const selected = agents.map(a => ({ id: a.plan.id, distance: Math.hypot(camera.position.x - a.state.x, camera.position.y - a.state.y, camera.position.z - a.state.z) })).filter(a => a.distance < radius).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, busy ? 4 : profile.dpr <= .85 ? 8 : 16)
    const next = selected.map((a, i) => ({ id: a.id, detailed: i < detail && a.distance < 32, label: walking && !busy && i < 2 && a.distance < 17 }))
    const key = next.map(a => `${a.id}:${a.detailed}:${a.label}`).join('|')
    if (selectionKey.current !== key) { selectionKey.current = key; setChoices(next) }
  })
  if (!outdoors) return null
  return <GraphicsContext.Provider value={npcProfile}>{choices.map(choice => {
    const agent = agents.find(a => a.plan.id === choice.id)
    return agent && <Student key={choice.id} plan={agent.plan} state={agent.state} detailed={choice.detailed} label={choice.label} />
  })}</GraphicsContext.Provider>
}
export default memo(CampusStudents)
