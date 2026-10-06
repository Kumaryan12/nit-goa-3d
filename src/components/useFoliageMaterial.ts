import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, FrontSide } from 'three'
import { createFoliageMaterial } from '../lib/foliageWind'
import type { FoliageFlex } from '../lib/foliageWind'

export function useFoliageMaterial(flex: FoliageFlex, amplitude: number, doubleSided = false) {
  const bundle = useMemo(() => {
    const wind = { time: { value: 0 }, amount: { value: amplitude } }
    return { wind, material: createFoliageMaterial({ color: 'white', roughness: .94, side: doubleSided ? DoubleSide : FrontSide }, flex, wind) }
  }, [flex, amplitude, doubleSided])
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { bundle.wind.amount.value = query.matches ? 0 : amplitude }
    update(); query.addEventListener('change', update)
    return () => { query.removeEventListener('change', update); bundle.material.dispose() }
  }, [bundle, amplitude])
  useFrame((_, delta) => { bundle.wind.time.value += Math.min(delta, .1) })
  return bundle.material
}
