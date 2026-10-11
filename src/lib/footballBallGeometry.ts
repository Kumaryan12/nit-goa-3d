import { CircleGeometry, Color, Float32BufferAttribute, Quaternion, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FOOTBALL_RADIUS } from './football.ts'

// One shaded draw call keeps the familiar white ball and black pentagons.
export function createFootballBallGeometry() {
  const points=[new Vector3(0,1,0),new Vector3(0,-1,0)]
  for(const y of [-.45,.45])for(let i=0;i<5;i++) {
    const a=i/5*Math.PI*2+(y>0?0:Math.PI/5)
    points.push(new Vector3(Math.cos(a)*Math.sqrt(1-y*y),y,Math.sin(a)*Math.sqrt(1-y*y)))
  }
  const sphere=new SphereGeometry(FOOTBALL_RADIUS,24,16)
  const pieces=[sphere,...points.map(point=>new CircleGeometry(.072,5).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,0,1),point)).translate(point.x*(FOOTBALL_RADIUS+.002),point.y*(FOOTBALL_RADIUS+.002),point.z*(FOOTBALL_RADIUS+.002)))]
  pieces.forEach((geometry,index)=>{
    const color=new Color(index?'#202b30':'#fbfaf2'),count=geometry.getAttribute('position').count,colors=new Float32Array(count*3)
    for(let i=0;i<count;i++)color.toArray(colors,i*3)
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3))
  })
  const merged=mergeGeometries(pieces)
  pieces.forEach(piece=>piece.dispose())
  if(!merged)throw Error('Football geometry could not be merged')
  merged.computeBoundingSphere();return merged
}
