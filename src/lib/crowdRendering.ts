import type { CampusPerson } from './campusProtocol.ts'
export interface CrowdChoice { id: string; detailed: boolean; label: boolean }
export function chooseCrowd(people: CampusPerson[], camera: { x: number; y: number; z: number }, space: string, walking: boolean, excluded: Iterable<string>, quality: 'smooth' | 'balanced' | 'detailed'): CrowdChoice[] {
  const hidden = new Set(excluded), distance = walking ? 160 : 1200
  const near = quality === 'smooth' ? 45 : quality === 'detailed' ? 80 : 60, budget = quality === 'smooth' ? 6 : quality === 'detailed' ? 12 : 8
  const candidates = people.flatMap(person => {
    const pose = person.pose
    if (!pose?.visible || hidden.has(person.id) || pose.space !== (walking ? space : 'outdoors')) return []
    const squared = (camera.x - pose.x) ** 2 + (camera.y - pose.y - 1) ** 2 + (camera.z - pose.z) ** 2
    return squared <= distance ** 2 ? [{ id: person.id, squared }] : []
  }).sort((a, b) => a.squared - b.squared || a.id.localeCompare(b.id))
  return candidates.map((person, index) => ({ id: person.id, detailed: index < budget && person.squared <= near ** 2, label: person.squared <= 55 ** 2 }))
}
