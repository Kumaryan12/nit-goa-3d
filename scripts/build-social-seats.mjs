import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractBuildingFootprints } from '../src/lib/buildings.ts'
import { extractCampusRoads } from '../src/lib/roads.ts'
import { validClosedRing } from '../src/lib/geo.ts'
import { createDigitalTwin } from '../src/lib/digitalTwin.ts'
import { theatreSeats } from '../src/lib/social.ts'
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
  const seats = theatreSeats(twin.theatre).filter(seat => seat.row >= 3)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(seats) + '\n')
  return seats
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const seats = await buildSocialSeats()
  console.log(`Published ${seats.length} OAT bench seats from the campus terrain.`)
}
