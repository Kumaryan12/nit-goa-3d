import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { avatarScalpPoint, createAvatarGeometry } from '../lib/avatarGeometry'
import type { BufferGeometry } from 'three'
import type { Group } from 'three'
import { advanceAvatarAnimation, freshAvatarAnimation } from '../lib/avatarAnimation'
import { avatarPose, motionDelta, ridingPose, socialPoseForMotion } from '../lib/avatarMotion'
import type { AvatarStyle } from '../lib/profile'
import type { AvatarMotion } from '../lib/avatarMotion'

import type { AvatarPart as Part, AvatarTriple as Triple } from '../lib/avatarGeometry'
const capsule = (radius: number, length: number, at: Triple, scale?: Triple): Part => ({ shape: 'capsule', size: [radius, length, 0], at, scale })
const sphere = (radius: number, at: Triple, scale?: Triple): Part => ({ shape: 'sphere', size: [radius, 0, 0], at, scale })
const box = (size: Triple, at: Triple): Part => ({ shape: 'box', size, at })
const rounded = (size: Triple, at: Triple): Part => ({ shape: 'rounded', size, at })
const painted = (parts: Part[], color: string): Part[] => parts.map(part => ({ ...part, color }))
const sharedParts = new Map<Part[], { geometry: BufferGeometry; users: number }>()

// Merge fixed detail by material so facial features and clothing details do not
// each need a separate draw call in the multiplayer crowd.
function Parts({ parts, color = '#ffffff', roughness = .85 }: { parts: Part[]; color?: string; roughness?: number }) {
  const shared = useMemo(() => {
    const existing = sharedParts.get(parts)
    if (existing) return existing
    const combined = createAvatarGeometry(parts)
    const shared = { geometry: combined, users: 0 }; sharedParts.set(parts, shared); return shared
  }, [parts])
  useEffect(() => {
    shared.users++
    return () => { shared.users--; queueMicrotask(() => { if (!shared.users && sharedParts.get(parts) === shared) { shared.geometry.dispose(); sharedParts.delete(parts) } }) }
  }, [parts, shared])
  return <mesh castShadow receiveShadow><primitive object={shared.geometry} attach="geometry" /><meshStandardMaterial color={color} vertexColors roughness={roughness} /></mesh>
}

// A compact student silhouette: rounded jacket, connected sleeves, tailored
// trousers and chunky sneakers. Fixed details are merged into their joint mesh.
const torsoParts = [rounded([.47, .49, .31], [0, .31, 0])]
const skinParts: Part[] = [capsule(.075, .07, [0, .65, 0]), { shape: 'head', size: [.215, 0, 0], at: [0, .84, -.01], scale: [.94, 1.02, .88] }, sphere(.035, [-.19, .842, .012], [.65, 1, .72]), sphere(.035, [.19, .842, .012], [.65, 1, .72]), sphere(.024, [0, .831, -.212], [.7, .95, .8])]
// Front is -Z. Swept locks frame the forehead; the shell extends lower at
// +Z so the rear reads as styled hair rather than a second skin-coloured face.
const scalp = (front: number, back: number): Part => ({ shape: 'scalp', size: [.224, front, back], at: [0, .845, -.008], scale: [.95, 1.03, .90] })
const boyHairParts = [{ ...scalp(1.08, 2.65), sweep: 1 }]
const girlHairParts = [scalp(1.10, 2.70)]
const faceParts: Part[] = [
  { shape: 'strand', size: [.0045, 0, 0], at: [0, 0, 0], curve: [[-.092, .909, -.184], [-.07, .915, -.190], [-.045, .910, -.196]] },
  { shape: 'strand', size: [.0045, 0, 0], at: [0, 0, 0], curve: [[.045, .910, -.196], [.07, .915, -.190], [.092, .909, -.184]] },
  { shape: 'strand', size: [.0035, 0, 0], at: [0, 0, 0], curve: [[-.024, .779, -.195], [0, .772, -.203], [.024, .779, -.195]] },
]
function hairStrands(style: AvatarStyle): Part[] {
  const paths = style === 'girl' ? [-.38, -.2, .2, .38] : [-.65, -.25, .15]
  return paths.map(offset => ({ shape: 'strand', size: [.0025, 0, 0], at: [0, .845, -.008], scale: [.95, 1.03, .90], curve: Array.from({ length: 8 }, (_, i) => avatarScalpPoint(.227, .32 + i * .105, offset + (style === 'girl' ? Math.sign(offset) * i * .065 : i * .07), style === 'boy' ? 1 : 0)) }))
}
const boyHairHighlights = hairStrands('boy'), girlHairHighlights = hairStrands('girl')
const earDetail = [-.208, .208].map(x => sphere(.018, [x, .842, .003], [.25, 1, .65]))
const heads = Object.fromEntries((['girl', 'boy'] as const).map(style => [style, [...painted(skinParts, '#cf9871'), ...painted(earDetail, '#bb8060'), ...painted(style === 'girl' ? girlHairParts : boyHairParts, '#242529'), ...painted(style === 'girl' ? girlHairHighlights : boyHairHighlights, '#3c3732'), ...painted(faceParts, '#684538')]])) as Record<AvatarStyle, Part[]>
const eyesParts = [...painted([-.065, .065].map(x => sphere(.024, [x, 0, -.199], [1, .8, .24])), '#fff9ec'), ...painted([-.065, .065].map(x => sphere(.012, [x, 0, -.205], [.85, 1, .22])), '#302a28'), ...painted([-.065, .065].map(x => sphere(.0035, [x + .003, .004, -.208], [1, 1, .3])), '#ffffff')]
const ponytail = [...painted([sphere(.068, [0, 0, 0], [1, .8, 1]), { ...capsule(.068, .165, [.012, -.14, .075], [1, 1, .75]), rotation: [-.28, 0, -.12] as Triple }, sphere(.055, [.028, -.265, .112], [1, .72, .7])], '#242529'), ...painted([rounded([.064, .018, .016], [0, -.022, .071])], '#bf9861'), ...painted([{ ...capsule(.003, .145, [-.024, -.14, .128], [1, 1, .7]), rotation: [-.28, 0, -.12] as Triple }], '#3c3732')]
// Varsity bomber: ivory sleeves, ribbed edges and a small chest monogram.
// The rear stays clean, with just a yoke seam below the styled hair.
const jacketDetails = [
  ...painted([
    rounded([.46, .065, .322], [0, .08, 0]),
    rounded([.20, .047, .065], [0, .562, .11]),
    ...[-1, 1].map(side => ({ ...rounded([.06, .055, .135], [side * .072, .557, -.034]), rotation: [0, 0, side * -.18] as Triple })),
    box([.018, .41, .012], [0, .31, -.164]),
  ], '#253735'),
  ...painted([
    box([.005, .38, .014], [0, .31, -.173]),
    rounded([.021, .034, .015], [0, .444, -.187]),
    ...[-1, 1].map(side => ({ ...rounded([.087, .014, .02], [side * .12, .19, -.164]), rotation: [0, 0, side * .35] as Triple })),
    rounded([.34, .009, .012], [0, .44, .157]),
    rounded([.42, .008, .328], [0, .082, 0]),
  ], '#f1ead4'),
]
const chestMonogram = [box([.009, .048, .016], [-.122, .39, -.172]), box([.009, .048, .016], [-.087, .39, -.172]), { ...box([.009, .05, .016], [-.105, .39, -.172]), rotation: [0, 0, -.6] as Triple }]
const upperLeg = [...painted([capsule(.094, .22, [0, -.185, 0])], '#304255'), ...painted([rounded([.12, .11, .018], [0, -.105, -.085])], '#3e5267')]
const lowerLeg = [...painted([capsule(.079, .24, [0, -.185, 0]), sphere(.08, [0, 0, 0])], '#304255'), ...painted([capsule(.081, .016, [0, -.315, 0])], '#233443')]
const pelvis = [rounded([.31, .14, .26], [0, .01, 0])]
const shoes = [...painted([rounded([.18, .118, .29], [0, -.037, -.07])], '#d8e4dd'), ...painted([rounded([.184, .042, .296], [0, -.108, -.07]), rounded([.125, .012, .035], [0, .027, -.08]), rounded([.115, .012, .03], [0, .027, -.13])], '#fff6e5'), ...painted([rounded([.014, .04, .095], [-.09, -.025, -.10]), rounded([.014, .04, .095], [.09, -.025, -.10]), rounded([.13, .065, .018], [0, -.025, .077])], '#d49c59')]
const sleeve = [capsule(.096, .135, [0, -.115, 0])]
const lowerSleeve = [capsule(.072, .115, [0, -.088, 0]), sphere(.074, [0, 0, 0])]
const hands = [...painted([capsule(.074, .014, [0, -.166, 0])], '#253735'), ...painted([capsule(.075, .003, [0, -.165, 0])], '#f1ead4'), ...painted([sphere(.067, [0, -.24, -.007], [.85, 1.1, .85]), sphere(.03, [-.04, -.228, -.045])], '#cf9871')]

const outfitPalettes = new Map<string, { body: Part[]; sleeve: Part[]; forearm: Part[] }>()
function outfitFor(jersey: string, accent: string) {
  const key = `${jersey}:${accent}`, existing = outfitPalettes.get(key)
  if (existing) return existing
  const parts = {
    body: [...painted(torsoParts, jersey), ...jacketDetails, ...painted(chestMonogram, accent), ...painted(pelvis, '#304255')],
    sleeve: [...painted(sleeve, '#f1ead4'), ...painted([capsule(.098, .017, [0, -.17, 0])], jersey), ...painted([capsule(.099, .004, [0, -.17, 0])], accent)],
    forearm: [...painted(lowerSleeve, '#f1ead4'), ...hands],
  }
  outfitPalettes.set(key, parts)
  return parts
}

export default function StudentAvatar({ style = 'boy', motion, jersey = '#277c77', accent = '#cf9254' }: { style?: AvatarStyle; motion: React.RefObject<AvatarMotion>; jersey?: string; accent?: string }) {
  const outfit = useMemo(() => outfitFor(jersey, accent), [jersey, accent])
  const root = useRef<Group>(null), torso = useRef<Group>(null), shoulders = useRef<Group>(null), head = useRef<Group>(null), tail = useRef<Group>(null), eyes = useRef<Group>(null)
  const leftHip = useRef<Group>(null), rightHip = useRef<Group>(null), leftKnee = useRef<Group>(null), rightKnee = useRef<Group>(null), leftFoot = useRef<Group>(null), rightFoot = useRef<Group>(null)
  const leftArm = useRef<Group>(null), rightArm = useRef<Group>(null), leftElbow = useRef<Group>(null), rightElbow = useRef<Group>(null)
  const animation = useRef(freshAvatarAnimation()), clock = useRef(0), kickTime = useRef(0), lastKick = useRef(motion.current.kick ?? 0)
  const reducedMotion = useRef(false)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = preference.matches }
    update(); preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useFrame((_, delta) => {
    const dt = motionDelta(delta), state = motion.current
    if (state.paused) return
    clock.current += dt
    const visual = advanceAvatarAnimation(animation.current, state, dt)
    if ((state.kick ?? 0) !== lastKick.current) { lastKick.current = state.kick ?? 0; kickTime.current = .45 }
    kickTime.current = Math.max(0, kickTime.current - dt)
    const riding = !!state.vehicle && state.vehicle !== 'walk'
    const pose = riding ? ridingPose(state.vehicle as 'bicycle' | 'buggy', state.phase, visual.speed) : avatarPose(state.phase, visual.speed, visual.run, reducedMotion.current ? 0 : clock.current, state.turn, kickTime.current > 0 ? 1 - kickTime.current / .45 : 0, false, undefined, visual.landing)
    if (!riding && visual.air > .001) {
      const jump = avatarPose(state.phase, visual.speed, visual.run, reducedMotion.current ? 0 : clock.current, state.turn, 0, true, state.verticalVelocity)
      for (const key of ['hips', 'knees', 'ankles', 'arms', 'elbows'] as const) pose[key] = pose[key].map((value, i) => value + (jump[key][i] - value) * visual.air)
      pose.rootY += (jump.rootY - pose.rootY) * visual.air
    }
    const social = kickTime.current ? null : socialPoseForMotion(state, Date.now(), reducedMotion.current)
    const easing = 1 - Math.exp(-dt * 22)
    const mix = (normal: number, gesture: number | undefined) => normal + ((gesture ?? normal) - normal) * (social?.weight ?? 0)
    const approach = (current: number, target: number) => current + (target - current) * easing
    ;[leftHip, rightHip].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.hips[i], social?.hips[i])) })
    ;[leftKnee, rightKnee].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.knees[i], social?.knees[i])) })
    ;[leftFoot, rightFoot].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.ankles[i], social?.ankles[i])) })
    ;[leftArm, rightArm].forEach((ref, i) => {
      if (ref.current) {
        ref.current.rotation.order = 'YXZ'
        ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.arms[i], social?.arms[i]))
        ref.current.rotation.y = approach(ref.current.rotation.y, mix(0, social?.armY[i]))
        ref.current.rotation.z = approach(ref.current.rotation.z, mix(i ? -.07 : .07, social?.armZ[i]))
      }
    })
    ;[leftElbow, rightElbow].forEach((ref, i) => { if (ref.current) ref.current.rotation.x = approach(ref.current.rotation.x, mix(pose.elbows[i], social?.elbows[i])) })
    if (root.current) {
      // During sitting/standing transitions, use the actual smoothed leg angles
      // to keep sneakers above the row floor instead of lerping through it.
      if (!state.airborne && !riding) {
        const soles = [[leftHip, leftKnee], [rightHip, rightKnee]].map(([hip, knee]) => .88 - .37 * Math.cos(hip.current?.rotation.x ?? 0) - .37 * Math.cos((hip.current?.rotation.x ?? 0) + (knee.current?.rotation.x ?? 0)) - .129)
        root.current.position.y = .011 - Math.min(...soles)
      } else root.current.position.y = approach(root.current.position.y, pose.rootY)
    }
    if (head.current) {
      const target = Math.max(-.15, Math.min(.15, (state.turn ?? 0) * .035))
      head.current.rotation.y += (target - head.current.rotation.y) * (1 - Math.exp(-dt * 8))
      head.current.rotation.z = reducedMotion.current || riding || social ? 0 : Math.sin(clock.current * 1.35) * .012
      head.current.rotation.x = reducedMotion.current ? 0 : Math.sin(state.phase * 2) * Math.min(1, visual.speed / 4) * .025
    }
    if (eyes.current) {
      const cycle = clock.current % 4.8
      const blink = reducedMotion.current ? 0 : Math.max(0, 1 - Math.abs(cycle - 4.5) / .09)
      eyes.current.scale.y = 1 - blink * .94
    }
    const secondary = reducedMotion.current || riding ? 0 : Math.min(1, visual.speed / 3)
    if (tail.current) {
      tail.current.rotation.x += (Math.sin(state.phase * 2 - .7) * secondary * .14 + visual.landing * .2 - tail.current.rotation.x) * (1 - Math.exp(-dt * 10))
      tail.current.rotation.z += (Math.sin(state.phase - .5) * secondary * .12 - tail.current.rotation.z) * (1 - Math.exp(-dt * 10))
    }
    if (torso.current) {
      torso.current.rotation.x = approach(torso.current.rotation.x, mix(pose.lean, social?.lean))
      torso.current.rotation.y = reducedMotion.current || riding || social ? 0 : Math.sin(state.phase) * Math.min(1, visual.speed / 3) * .055
      torso.current.rotation.z = approach(torso.current.rotation.z, mix(pose.sway + pose.bank, social ? social.sway + social.bank : undefined))
    }
    // Hands retain the established handlebar / steering-wheel positions while
    // walking shoulders follow the jacket's lean and counter-rotation.
    if (shoulders.current && torso.current) riding ? shoulders.current.rotation.set(0, 0, 0) : shoulders.current.rotation.copy(torso.current.rotation)
  })
  return <group ref={root} name={`campus-student-avatar-${style}`}>
    <group ref={torso} position={[0, .88, 0]}>
      <Parts parts={outfit.body} />
      <group ref={head} position={[0, .65, 0]}><group position={[0, -.65, 0]}>
        <Parts parts={heads[style]} roughness={.68} />
        {style === 'girl' && <group ref={tail} position={[0, .93, .185]}><Parts parts={ponytail} roughness={.7} /></group>}
        <group ref={eyes} position={[0, .875, 0]}>
          <Parts parts={eyesParts} roughness={.4} />
        </group>
      </group></group>
    </group>
    <group ref={shoulders} position={[0, .88, 0]}>
      {[[leftArm, leftElbow], [rightArm, rightElbow]].map(([arm, elbow], i) => <group key={`arm-${i}`} ref={arm} position={[i ? .29 : -.29, .52, 0]}>
        <Parts parts={outfit.sleeve} />
        <group ref={elbow} position={[0, -.235, 0]}><Parts parts={outfit.forearm} /></group>
      </group>)}
    </group>
    {[[leftHip, leftKnee, leftFoot], [rightHip, rightKnee, rightFoot]].map(([hip, knee, foot], i) => <group key={`leg-${i}`} ref={hip} position={[i ? .115 : -.115, .88, 0]}>
      <Parts parts={upperLeg} />
      <group ref={knee} position={[0, -.37, 0]}>
        <Parts parts={lowerLeg} />
        <group ref={foot} position={[0, -.37, 0]}><Parts parts={shoes} /></group>
      </group>
    </group>)}
  </group>
}
