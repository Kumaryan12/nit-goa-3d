import type { GraphicsMode, GraphicsProfile } from './graphics.ts'
import type { FootballPitch } from './football.ts'
import type { TreeInstance } from './vegetation.ts'

// Leave headroom for running and a busy pitch: idle 60 fps must not promote
// automatic football rendering into the most expensive campus quality tier.
export function footballGraphicsProfile(profile:GraphicsProfile,joined:boolean,mode:GraphicsMode):GraphicsProfile {
  if(!joined || mode==='detailed')return profile
  return {...profile,dpr:Math.min(profile.dpr,1.15),shadowSize:Math.min(profile.shadowSize,1024),shadowRate:Math.min(profile.shadowRate,6),detailDistance:Math.min(profile.detailDistance,120)}
}

// The player and follow camera stay on the pitch. Keep generous surrounding
// greenery, but don't send all 640 trees into every football shadow pass.
export function footballTrees(trees:TreeInstance[],pitch:FootballPitch|null,joined:boolean) {
  if(!joined || !pitch)return trees
  return trees.filter(tree=>Math.hypot(tree.x-pitch.center.x,tree.z-pitch.center.z)<140+tree.scale*8)
}
