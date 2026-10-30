import { Vector3 } from 'three'
import type { Camera, Object3D } from 'three'
import type { CampusPerson, CampusPose } from './campusProtocol.ts'
import type { PhotoPerson } from './postcard.ts'
import { postcardText } from './postcard.ts'

// A shutter-time suggestion list, not a location finder. The photographer
// chooses who actually belongs in the image (a wall can occlude a candidate).
export function photoGroup(scene: Object3D, camera: Camera, people: readonly CampusPerson[], selfId: string | null, localPose: CampusPose | null, walking: boolean): PhotoPerson[] {
  if (!walking || !localPose?.visible) return []
  const roster = new Map(people.map(person => [person.id, person])), found = new Map<string, PhotoPerson>()
  scene.traverseVisible(object => {
    const id = object.userData.photoPersonId, person = roster.get(id)
    const pose = id === selfId ? localPose : person?.pose
    if (!person || !pose?.visible || pose.space !== localPose.space || Math.hypot(pose.x - localPose.x, pose.y - localPose.y, pose.z - localPose.z) > 25 || found.has(id)) return
    const head = new Vector3(0, 1.25, 0).applyMatrix4(object.matrixWorld).project(camera)
    if (![head.x, head.y, head.z].every(Number.isFinite) || Math.abs(head.x) > 1 || Math.abs(head.y) > 1 || Math.abs(head.z) > 1) return
    found.set(id, { id, name: postcardText(person.name, 24), x: (head.x + 1) / 2, y: (1 - head.y) / 2 })
  })
  return [...found.values()].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id)).slice(0, 32)
}
