import { useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { fadeLabel, labelOpacity } from '../lib/labels'
import { campusTopography } from '../data/topography'
import type { CampusLocation } from '../types/campus'

const labeled = new Set(['academic-block', 'boys-hostel', 'girls-hostel', 'canteen', 'sports-ground', 'main-entrance', 'open-air-theatre'])

function LocationLabel({ location, height }: { location: CampusLocation; height: number }) {
  const gl = useThree((state) => state.gl)
  // Keep Html's DOM root in the canvas wrapper as Fiber connects its events.
  // A changing default portal target otherwise destroys and recreates roots.
  const portal = useRef(gl.domElement.parentElement!)
  const label = useRef<HTMLDivElement>(null)
  const opacity = useRef(0)
  const point = useMemo(() => new Vector3(location.coordinates.x, (location.elevation ?? 0) + height + 8, location.coordinates.z), [location, height])
  const projected = useMemo(() => new Vector3(), [])
  useFrame(({ camera }, delta) => {
    projected.copy(point).project(camera)
    const target = labelOpacity(camera.position.distanceTo(point), projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2)
    opacity.current = fadeLabel(opacity.current, target, delta)
    if (label.current) {
      label.current.style.opacity = String(opacity.current)
      label.current.style.visibility = opacity.current < 0.01 ? 'hidden' : 'visible'
    }
  })
  return <Html portal={portal} position={point} center pointerEvents="none" zIndexRange={[20, 0]} wrapperClass="location-label-wrapper">
    <div ref={label} className="location-label" style={{ opacity: 0 }}>{location.name}</div>
  </Html>
}

export default function LocationLabels({ locations, heights }: { locations: CampusLocation[]; heights: Record<string, number> }) {
  return <group>{locations.filter((location) => labeled.has(location.id) || location.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') === campusTopography.upperLocationName.toLowerCase()).map((location) => <LocationLabel key={location.id} location={location} height={heights[location.id] ?? 0} />)}</group>
}
