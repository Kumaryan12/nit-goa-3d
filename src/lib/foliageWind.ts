import { MeshStandardMaterial, ShaderChunk } from 'three'
import type { MeshStandardMaterialParameters } from 'three'

export type FoliageFlex = 'canopy' | 'palm' | 'grass'
export interface FoliageWind { time: { value: number }; amount: { value: number } }

// Two slow, spatially varying waves, bounded by 1.35 * amount. Trunks and
// grass roots stay fixed; instance transforms are uploaded only once.
export function foliageProjectVertex(flex: FoliageFlex): string {
  const weight = flex === 'grass' ? 'pow(clamp(position.y, 0.0, 1.0), 2.0)'
    : flex === 'palm' ? 'pow(clamp(position.z / 4.6, 0.0, 1.0), 2.0)'
    : '(0.7 + 0.3 * clamp(position.y, 0.0, 1.0))'
  return ShaderChunk.project_vertex.replace('mvPosition = modelViewMatrix * mvPosition;', `
    float campusFlex = ${weight};
    float campusBreeze = sin(campusWindTime * 0.8 + mvPosition.x * 0.08 + mvPosition.z * 0.06)
      + 0.35 * sin(campusWindTime * 1.3 + mvPosition.z * 0.12);
    mvPosition.x += campusBreeze * campusWindAmount * campusFlex;
    mvPosition.z += sin(campusWindTime * 0.7 + mvPosition.x * 0.06) * campusWindAmount * campusFlex * 0.55;
    mvPosition = modelViewMatrix * mvPosition;
  `)
}

export function createFoliageMaterial(parameters: MeshStandardMaterialParameters, flex: FoliageFlex, wind: FoliageWind): MeshStandardMaterial {
  const material = new MeshStandardMaterial(parameters)
  material.onBeforeCompile = shader => {
    shader.uniforms.campusWindTime = wind.time
    shader.uniforms.campusWindAmount = wind.amount
    shader.vertexShader = `uniform float campusWindTime;\nuniform float campusWindAmount;\n${shader.vertexShader}`
      .replace('#include <project_vertex>', foliageProjectVertex(flex))
  }
  material.customProgramCacheKey = () => `campus-foliage-wind-v1/${flex}`
  return material
}
