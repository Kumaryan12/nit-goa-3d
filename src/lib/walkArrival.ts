import type { CampusLocation } from '../types/campus.ts'
import type { DigitalTwin } from './digitalTwin.ts'
import type { LocalCoordinate } from './geo.ts'
import { gpsToLocal } from './geo.ts'
import type { HostelPlan } from './hostelInterior.ts'
import { campusFacadeFront } from './campusFacade.ts'
import { createAdministrationFacade } from './administrationFacade.ts'
import { findEntranceSpawn, findWalkSpawn } from './walking.ts'
import type { WalkEntrance, WalkWorld } from './walking.ts'

export interface WalkArrival { position: LocalCoordinate; yaw: number; entrance?: WalkEntrance }
export function arrivalFacing(position: LocalCoordinate, arrival: WalkArrival): number {
  const entrance = arrival.entrance
  if (!entrance || Math.hypot(position.x - entrance.point.x, position.z - entrance.point.z) < .001) return arrival.yaw
  return Math.atan2(position.x - entrance.point.x, position.z - entrance.point.z)
}
const direction = (from: LocalCoordinate, to: LocalCoordinate) => {
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  return length ? { x: (to.x - from.x) / length, z: (to.z - from.z) / length } : { x: 0, z: 1 }
}
export function findLocationArrival(location: CampusLocation, twin: DigitalTwin, world: WalkWorld, plans: (HostelPlan | null)[] = [twin.interiors?.hostel ?? null, twin.interiors?.gyan ?? null]): WalkArrival | null {
  const selection = twin.selections.find(item => item.location.id === location.id)
  const building = twin.buildings.find(item => item.id === (selection?.buildingId ?? location.osmBuildingId ?? location.id))
  const plan = plans.find(item => item && item.buildingId === building?.id)
  let entrance: WalkEntrance | undefined, distance = 2.4
  if (plan) entrance = { point: plan.entrance.point, outward: { x: -plan.entrance.inward.x, z: -plan.entrance.inward.z } }
  else if (building && location.id === 'administration-block') {
    const gate = twin.locations.find(item => item.id === 'main-entrance')
    const facade = gate && createAdministrationFacade(building, gate.coordinates, twin.roads)
    if (facade) {
      entrance = { point: facade.front.center, outward: facade.front.outward }
      distance = Math.max(2.4, 6.45 * facade.porchScale + 1)
    }
  } else if (building) {
    const front = campusFacadeFront(building, twin.roads)
    if (front) entrance = { point: front.entrance, outward: front.front.outward }
  } else if (location.id === 'main-entrance') {
    const centre = twin.boundary.length ? twin.boundary.reduce((sum, p) => ({ x: sum.x + p.x / twin.boundary.length, z: sum.z + p.z / twin.boundary.length }), { x: 0, z: 0 }) : { x: 0, z: 0 }
    const inward = direction(location.coordinates, centre)
    const position = findEntranceSpawn({ point: location.coordinates, outward: inward }, world)
    return position ? { position, yaw: Math.atan2(-inward.x, -inward.z), entrance: { point: location.coordinates, outward: inward } } : null
  } else if (location.id === 'open-air-theatre') {
    entrance = { point: twin.theatre.entrance, outward: direction(twin.theatre.center, twin.theatre.entrance) }
    distance = 0
  }
  if (entrance) {
    if (building) entrance.buildingOuter = building.outer.map(gpsToLocal)
    const position = findEntranceSpawn(entrance, world, distance)
    if (!position) return null
    const arrival = { position, yaw: Math.atan2(entrance.outward.x, entrance.outward.z), entrance }
    arrival.yaw = arrivalFacing(position, arrival)
    return arrival
  }
  // Open places such as the sports ground have no building doorway.
  if (building) return null
  const position = findWalkSpawn(location.coordinates, world)
  return position ? { position, yaw: 0 } : null
}
