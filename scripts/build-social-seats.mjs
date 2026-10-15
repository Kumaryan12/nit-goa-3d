import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { validClosedRing } from '../src/lib/geo.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { theatreSeats } from '../src/lib/social.ts'
import { createSeminarPlan, SEMINAR_ID } from '../src/lib/seminarInterior.ts'
import { createWalkWorld, isWalkable } from '../src/lib/walking.ts'
import { createScreeningLayout } from '../src/lib/screening.ts'
import { createConcertLayout } from '../src/lib/concertSeating.ts'
import { cafeCounters } from '../src/lib/cafe.ts'
import { savedCampusOverrides } from '../src/data/campusOverrides.ts'
import { defaultTerrainSettings } from '../src/data/topography.ts'

export async function buildSocialSeats(target = 'dist/map/nit-goa-social-seats.json') {
  const [campus, roadData] = await Promise.all(['campus', 'roads'].map(async kind => JSON.parse(await readFile(`public/map/nit-goa-${kind}.json`, 'utf8'))))
  const boundary = validClosedRing(campus.elements.find(element => element.type === 'way' && element.id === 1259742369)?.geometry)
  if (!boundary) throw new Error('Cannot publish seats without the campus boundary.')
  const buildings = extractBuildingFootprints(campus.elements), roads = extractCampusRoads(roadData.elements, boundary)
  const twin = createDigitalTwin(
    { buildings, boundary, source: 'campus-area', returnedBuildingCount: buildings.length },
    { roads, boundary, source: 'campus-area', returnedRoadCount: roads.length },
    false, savedCampusOverrides, defaultTerrainSettings,
  )
  // Front rows are reserved for the concert room's seated audience.
  const seats = [...theatreSeats(twin.theatre).filter(seat => seat.row >= 3), ...(twin.terrain.cafe?.seats ?? [])]
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(seats) + '\n')
  await writeFile(resolve(dirname(target), 'nit-goa-cafe-counters.json'), JSON.stringify(twin.terrain.cafe ? cafeCounters(twin.terrain.cafe, twin.terrain) : []) + '\n')
  await writeFile(resolve(dirname(target), 'nit-goa-concert-layout.json'), JSON.stringify(createConcertLayout(twin.theatre)) + '\n')
  const world = createWalkWorld(twin.buildings, twin.boundary, twin.terrain, twin.trees, twin.lamps)
  const seminar = twin.buildings.find(b => b.id === SEMINAR_ID)
  const screening = createScreeningLayout(seminar ? createSeminarPlan(seminar, p => isWalkable(p, world)) : null)
  if (screening.seats.length !== 32) throw Error('Cannot publish screening seats without Chapora Hall.')
  await writeFile(resolve(dirname(target), 'nit-goa-screening-layout.json'), JSON.stringify(screening) + '\n')
  return seats
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const seats = await buildSocialSeats()
  console.log(`Published ${seats.length} OAT and café seats from the campus terrain.`)
}
