import { createAvatarGeometry } from './avatarGeometry.ts'
import type { AvatarStyle } from './profile.ts'

// Shared rigid joints keep every opponent articulated without mounting the
// portrait model and rebuilding its many clothing meshes as distances change.
export function createFootballAvatarGeometry(style:AvatarStyle) {
  return {
    head:createAvatarGeometry([
      {shape:'head',size:[.215,0,0],at:[0,0,0],scale:[.9,1,.85],color:'#d4a17c'},
      {shape:'scalp',size:[.236,1.3,style==='girl'?2.55:2.5],at:[0,.005,.002],scale:[.88,1.08,.88],sweep:style==='boy'?1:0,fringe:style==='boy'?'swept':'curtain',color:'#242529'},
      ...[-.07,.07].map(x=>({shape:'box' as const,size:[.035,.015,.014] as [number,number,number],at:[x,.01,-.179] as [number,number,number],color:'#49352e'})),
      {shape:'box',size:[.055,.009,.012],at:[0,-.098,-.174],color:'#935d50'},
      ...(style==='girl'?[{shape:'capsule' as const,size:[.065,.18,0] as [number,number,number],at:[.015,-.12,.2] as [number,number,number],color:'#242529'}]:[]),
    ]),
    body:createAvatarGeometry([{shape:'rounded',size:[.47,.49,.31],at:[0,0,0]}]),
    arm:createAvatarGeometry([
      {shape:'capsule',size:[.085,.32,0],at:[0,-.22,0],color:'#f1ead4'},
      {shape:'sphere',size:[.067,0,0],at:[0,-.47,0],color:'#cf9871'},
    ]),
    leg:createAvatarGeometry([
      {shape:'capsule',size:[.085,.57,0],at:[0,-.38,0],color:'#304255'},
      {shape:'rounded',size:[.18,.12,.29],at:[0,-.76,-.065],color:'#fff6e5'},
    ]),
  }
}
