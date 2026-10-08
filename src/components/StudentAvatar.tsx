import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { createAvatarGeometry } from '../lib/avatarGeometry'
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
const torsoParts = [rounded([.47, .49, .31], [0, .31, 0]), sphere(.13, [0, .55, .075], [1.35, .72, .95])]
const skinParts = [capsule(.075, .07, [0, .65, 0]), sphere(.215, [0, .84, -.01], [.94, 1.02, .88]), sphere(.043, [-.195, .84, 0]), sphere(.043, [.195, .84, 0]), sphere(.036, [0, .825, -.198], [.65, .75, 1])]
const boyHairParts = [sphere(.215, [0, .963, .022], [1, .57, .85]), sphere(.13, [-.10, .978, -.095], [1, .66, .8]), sphere(.12, [.085, .982, -.055], [1, .6, 1]), capsule(.031, .085, [-.188, .875, .04]), capsule(.031, .085, [.188, .875, .04])]
const girlHairParts = [sphere(.215, [0, .963, .025], [1, .61, .88]), sphere(.12, [-.11, .953, -.095], [1, .65, .78]), sphere(.095, [.13, .944, -.04], [.65, 1, .8]), capsule(.044, .17, [-.185, .83, .07]), capsule(.044, .17, [.185, .83, .07])]
const faceParts = [rounded([.055, .012, .013], [-.07, .917, -.182]), rounded([.055, .012, .013], [.07, .917, -.182]), { ...capsule(.006, .033, [-.017, .77, -.191]), rotation: [0, 0, 1.25] as Triple }, { ...capsule(.006, .033, [.017, .77, -.191]), rotation: [0, 0, -1.25] as Triple }]
const hairHighlights = [sphere(.07, [-.115, .986, -.11], [1, .25, .45]), sphere(.04, [.11, .985, -.06], [1, .25, .5])]
const heads = Object.fromEntries((['girl', 'boy'] as const).map(style => [style, [...painted(skinParts, '#cf9871'), ...painted(style === 'girl' ? girlHairParts : boyHairParts, '#292626'), ...painted(hairHighlights, '#453b33'), ...painted(faceParts, '#684538')]])) as Record<AvatarStyle, Part[]>
const eyesParts = [...painted([-.07, .07].map(x => sphere(.029, [x, 0, -.189], [.9, 1, .34])), '#fff9ec'), ...painted([-.07, .07].map(x => sphere(.015, [x, 0, -.200], [.85, 1.1, .3])), '#302a28'), ...painted([-.07, .07].map(x => sphere(.005, [x + .003, .006, -.205], [1, 1, .4])), '#ffffff')]
const ponytail = [...painted([sphere(.072, [0, 0, 0]), { ...capsule(.079, .18, [.018, -.155, .06], [1, 1, .8]), rotation: [-.25, 0, -.12] as Triple }], '#292626'), ...painted([capsule(.074, .01, [0, -.034, .016], [1, .65, .85])], '#c8a66a')]
const bagParts = [rounded([.33, .40, .16], [0, .31, .25]), rounded([.28, .16, .055], [0, .22, .352])]
const bagDetail = [...painted([box([.23, .014, .012], [0, .304, .387]), rounded([.06, .017, .018], [.07, .304, .397]), capsule(.017, .075, [-.105, .545, .24]), capsule(.017, .075, [.105, .545, .24])], '#333b3b'), ...painted([rounded([.065, .045, .015], [0, .405, .338])], '#f0e5c8')]
const jacketDetails = [...painted([rounded([.46, .065, .322], [0, .08, 0]), capsule(.024, .40, [-.166, .34, -.164], [1, 1, .6]), capsule(.024, .40, [.166, .34, -.164], [1, 1, .6]), box([.018, .41, .012], [0, .31, -.164])], '#253735'), ...painted([box([.005, .38, .014], [0, .31, -.173]), rounded([.043, .009, .016], [-.105, .37, -.172]), rounded([.043, .009, .016], [-.105, .41, -.172]), box([.009, .048, .016], [-.122, .39, -.172]), box([.009, .048, .016], [-.087, .39, -.172]), { ...box([.009, .05, .016], [-.105, .39, -.172]), rotation: [0, 0, .6] as Triple }, rounded([.095, .012, .02], [-.105, .18, -.172]), rounded([.095, .012, .02], [.105, .18, -.172]), capsule(.009, .095, [-.035, .47, -.18]), capsule(.009, .095, [.035, .47, -.18])], '#f1ead4')]
const upperLeg = [...painted([capsule(.094, .22, [0, -.185, 0])], '#304255'), ...painted([rounded([.12, .11, .018], [0, -.105, -.085])], '#3e5267')]
const lowerLeg = [...painted([capsule(.079, .24, [0, -.185, 0]), sphere(.08, [0, 0, 0])], '#304255'), ...painted([capsule(.081, .016, [0, -.315, 0])], '#233443')]
const pelvis = [rounded([.31, .14, .26], [0, .01, 0])]
const shoes = [...painted([rounded([.18, .118, .29], [0, -.037, -.07])], '#d8e4dd'), ...painted([rounded([.184, .042, .296], [0, -.108, -.07]), rounded([.125, .012, .035], [0, .027, -.08]), rounded([.115, .012, .03], [0, .027, -.13])], '#fff6e5'), ...painted([rounded([.014, .04, .095], [-.09, -.025, -.10]), rounded([.014, .04, .095], [.09, -.025, -.10]), rounded([.13, .065, .018], [0, -.025, .077])], '#d49c59')]
const sleeve = [capsule(.096, .135, [0, -.115, 0])]
const lowerSleeve = [capsule(.072, .115, [0, -.088, 0]), sphere(.074, [0, 0, 0])]
const hands = [...painted([capsule(.074, .014, [0, -.166, 0])], '#f1ead4'), ...painted([sphere(.067, [0, -.24, -.007], [.85, 1.1, .85]), sphere(.03, [-.04, -.228, -.045])], '#cf9871')]

const outfitPalettes = new Map<string, { body: Part[]; forearm: Part[]; bag: Part[] }>()
function outfitFor(jersey: string, accent: string) {
  const key = `${jersey}:${accent}`, existing = outfitPalettes.get(key)
  if (existing) return existing
  const parts = { body: [...painted(torsoParts, jersey), ...jacketDetails, ...painted(pelvis, '#304255')], forearm: [...painted(lowerSleeve, jersey), ...hands], bag: [...painted(bagParts, accent), ...bagDetail] }
  outfitPalettes.set(key, parts)
  return parts
}

export default function StudentAvatar({ style = 'boy', motion, jersey = '#277c77', accent = '#cf9254' }: { style?: AvatarStyle; motion: React.RefObject<AvatarMotion>; jersey?: string; accent?: string }) {
  const outfit = useMemo(() => outfitFor(jersey, accent), [jersey, accent])
  const root = useRef<Group>(null), torso = useRef<Group>(null), shoulders = useRef<Group>(null), head = useRef<Group>(null), backpack = useRef<Group>(null), tail = useRef<Group>(null), eyes = useRef<Group>(null)
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
    if (backpack.current) {
      const bounce = Math.sin(state.phase * 2) * secondary * .015
      backpack.current.position.y += (.54 + bounce - backpack.current.position.y) * (1 - Math.exp(-dt * 10))
      backpack.current.rotation.x += (secondary * .045 + visual.landing * .08 - backpack.current.rotation.x) * (1 - Math.exp(-dt * 10))
    }
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
        <Parts parts={heads[style]} roughness={.8} />
        {style === 'girl' && <group ref={tail} position={[0, .93, .185]}><Parts parts={ponytail} roughness={.7} /></group>}
        <group ref={eyes} position={[0, .875, 0]}>
          <Parts parts={eyesParts} roughness={.4} />
        </group>
      </group></group>
      <group ref={backpack} position={[0, .54, .23]}><group position={[0, -.54, -.23]}><Parts parts={outfit.bag} /></group></group>

    </group>
    <group ref={shoulders} position={[0, .88, 0]}>
      {[[leftArm, leftElbow], [rightArm, rightElbow]].map(([arm, elbow], i) => <group key={`arm-${i}`} ref={arm} position={[i ? .29 : -.29, .52, 0]}>
        <Parts parts={sleeve} color={jersey} />
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
