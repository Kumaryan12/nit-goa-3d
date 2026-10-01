# NIT Goa 3D Explorer

A full-viewport Vite, React, and TypeScript campus explorer built with Three.js, React Three Fiber, and Drei. Real OpenStreetMap ways and multipolygon relations provide the extruded footprints. Phase 5 adds terrain, terracotta roofs, tropical vegetation, labels, campus boundary walls, day/night lighting, and smooth camera navigation while preserving real OSM footprints, roads, metadata, and building selection. No buildings or roads are invented or bundled as production placeholders.

## Run locally

Use Node.js 22.12+ (or a supported newer version).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

## Scene conventions

- One world unit is approximately one meter; Y points upward.
- The GPS origin is latitude `15.16773`, longitude `74.01548`. East is +X, north is -Z.
- The terrain covers the real campus boundary and building extents with a 260 meter total margin. Built features remain at Y=0; open land varies by approximately 0–2.1 meters.
- The optional grid has 5 meter cells, starts disabled, and can be toggled with the Grid button.
- The perspective camera starts at `[110, 110, 110]`, looking at the origin, then fits the real buildings from an isometric angle. Viewport resizing refits the view; selecting a building, changing lighting, toggling the grid, or loading roads preserves it.
- Drag to orbit, scroll to zoom, and right-drag to pan. On touchscreens, use one finger to orbit and two fingers to zoom or pan.
- Click a building to show its name, category, and description. Close the information panel with its close button, Escape, or a click on empty scene space. Selected buildings remain highlighted; selecting or dismissing a building preserves the camera.
- Edit `src/lib/sceneConfig.ts` to adjust scale, colors, camera, and sun placement.

## OpenStreetMap pipeline

`src/lib/osm.ts` first queries campus way `1259742369` using `map_to_area`, then fetches building ways and relations with `out geom;`. If that request fails or yields no usable polygons, it queries buildings within 900 meters of the origin. The footer identifies the nearby fallback when used, since it can include buildings outside campus.

The default endpoint is `https://overpass-api.de/api/interpreter`. To configure another instance, copy `.env.example` to `.env.local`, update `VITE_OVERPASS_ENDPOINT`, and restart Vite. Each request has a 45 second timeout; loading and error overlays leave the rest of the scene operational.

`geo.ts` converts GPS coordinates into local meters. `buildings.ts` validates closed rings, joins fragmented relation members, preserves courtyard holes, and avoids rendering relation members twice. Building height uses a positive numeric `height` (optional `m` suffix), then positive `building:levels × 3.2`, then a matched campus override from `src/data/buildingOverrides.ts`, then 10 meters. Overrides are applied after metadata matching. Their height/floor values are editable visual estimates, not surveyed dimensions.

Buildings have varied warm cream concrete, thin expanded terracotta roofs with a procedural tile pattern, and instanced windows that glow at night. Courtyard holes remain open. Buildings cast and receive shadows and highlight on hover/selection. Development builds log OSM counts and source and show sampled FPS, render calls and triangle counts. OpenStreetMap contributor attribution is visible in the footer.

The real campus-area response used for regression tests contains 14 building ways and 8 building relations (22 footprints, 11 courtyard holes). Public Overpass availability and current OSM coverage can vary. Tests read a genuine recorded response; the application always fetches live data and never substitutes the test fixture.

## Campus metadata

`src/types/campus.ts` defines `CampusLocation` with a stable `id`, `name`, `category`, `description`, `keywords`, and approximate local-meter `coordinates: { x, z }`. `src/data/campus.ts` contains Academic Block, Administration Block, Boys Hostel, Girls Hostel, Canteen, Sports Ground, and Main Entrance. Categories also support amenities and other locations for later phases.

Hostel identities are grounded in named OSM footprints and [NIT Goa's hostel facilities page](https://nitgoa.ac.in/hostels/facilities.html): Talpona is the boys' hostel and Terekhol is the girls' hostel. General campus facilities are described in [NIT Goa's admission brochure](https://www.nitgoa.ac.in/uploads/Admissionbrochure30may2024.pdf).

The coordinate anchors are editable estimates. Academic, administration, and canteen identities are **provisional**, not independently verified building labels. `src/lib/campus.ts` first checks exact normalized OSM names against location names/keywords, then matches unnamed footprints to the nearest unused building location within 40 meters of the footprint's bounding-box center. Name matches take priority; each location and footprint can be assigned only once. Results are independent of Overpass result ordering. The panel marks proximity matches as approximate. Refine anchors in `campus.ts` as campus identities become known.

Sports Ground and Main Entrance have illustrative POI geometry at the existing approximate metadata anchors: a grass football field with white lines and goals, and an entrance gate with a short path to the nearest mapped road. They do not relabel unrelated buildings. These objects and landscaping are procedural visual additions, not surveyed OSM features. Unmatched footprints keep their OSM IDs and names (or `Unnamed campus building`) and remain clickable. Mesh `userData` carries both `osmId` and `locationId` for future connections. No gallery is implemented.

## Campus roads

`fetchCampusRoads` in `src/lib/osm.ts` uses a separate campus-area `highway=*` query with `out geom;`. This includes service roads, footways, and paths. If the area request fails or yields no usable roads, the loader uses the real campus boundary in a polygon Overpass query. Roads never use the building loader's 900 meter fallback. A missing boundary fails safely; a successful empty response displays a no-mapped-roads message.

`src/lib/roads.ts` converts GPS centerlines through the same `gpsToLocal` function as buildings, removes consecutive duplicate coordinates, rejects malformed geometry, and clips centerlines to the campus polygon, including concave boundaries. Linear road and footpath classifications are supported; proposed/construction features and `area=yes` plazas are excluded. Width uses a valid OSM `width` tag (0.3–30 m), otherwise estimated defaults: service roads 4.5 m, driveways/tracks 3 m, other roads 6 m, footpaths 1.8 m, cycleways 2.5 m.

`src/lib/roadGeometry.ts` builds flat mesh ribbons in world X/Z with shared, bounded miter joins. Asphalt roads sit at Y = 0.06 m and lighter footpaths at Y = 0.08 m, above both ground and the grid. Materials are rough and receive building shadows. `OSMRoads` has no pointer handlers, so building selection remains available. Road loading/error state is independent of building state, and road arrival does not reset the camera or selected building.

The live response recorded for tests has 20 service-road ways and no separately mapped footways/paths. Rendering follows current OSM coverage without generating missing routes. Tests cover cardinal coordinate conversion, real-road conversion, campus clipping, ribbon geometry, and Overpass fallback/error/cancellation handling. No external texture assets or invented OSM routes are included.

## Phase 5 digital twin

- **Boundary:** `CampusBoundary` follows the actual OSM campus polygon with a raised outline and short instanced wall panels/posts. Terrain outside the polygon is green. The decorative boundary has no pointer handlers and leaves a small opening near the provisional entrance.
- **Terrain:** `Terrain` renders a 160 × 160 cell plane (51,200 triangles) with deterministic multi-scale value noise and vertex colors. Two cells of flat clearance around roads, building bounding boxes, POIs and the boundary prevent interpolated triangles from crossing built surfaces. Open areas vary gently. This is procedural terrain, not surveyed elevation data. Tree bases sample the exact terrain triangle interpolation.
- **Vegetation:** 640 seeded trees are distributed along roads, around buildings, near the perimeter and in open spaces. Clearance checks exclude buildings, roads, the sports field and gate. A spatial hash prevents tightly overlapping trees. Three instanced meshes render trunks, low-poly crowns and tropical palm fronds; no hundreds-of-components tree hierarchy is used. Vegetation waits for both OSM requests to settle so late roads cannot cross tree placements.
- **Labels:** `LocationLabels` uses camera-facing Drei Html for six landmarks. Matched buildings use their actual footprint centers and rendered height. Labels fade between 850 and 1,400 meters, animate opacity without React state updates, and hide behind the camera or outside the viewport. Label elements do not intercept clicks.
- **Lighting:** Day uses warm sunlight and sky; Night uses a dark sky, stars, cool moonlight and warm emissive windows. Both retain directional shadows. The renderer caps DPR at 1.5 and uses PCF shadows.
- **Navigation:** Drei CameraControls adds damped rotation, smooth wheel/pinch zoom and animated reset/fly-to. `src/lib/camera.ts` exports `lookupCameraLocation`, `flyToLocation` and `campusCameraView`. Quick location buttons and the existing information panel expose fly-to; unknown IDs return null. There is no search UI. `CampusScene` is memoized so sampled performance updates do not rerender the 3D layers.
- **Loading:** Buildings and roads remain independent. A four-stage checklist shows Buildings, Roads, Terrain and Vegetation. Buildings are usable while roads load. A road error offers **Retry roads**, preserving the camera and current selection. A missing boundary renders no invented fence or trees.

### Verification

`npm test` includes the existing OSM and metadata tests plus height-priority/override, terrain generation/interpolation, road/building/boundary alignment, tree placement, courtyard-preserving roofs, label fading and camera lookup tests. `npm run build` checks all TypeScript and creates the production bundle.

The real recorded campus fixtures produce **22 buildings, 20 roads and 640 trees**. A nearby building fallback may include 23 buildings. During local browser inspection, the scene reported approximately **30 fps with Chrome Energy Saver enabled**, roughly **86–135 render calls** depending on the view, and **173–175k rendered triangles** including visible shadow work. Initial model generation measured about **103 ms** in Node on this machine. These are local development observations, not a cross-device benchmark; current live OSM counts and public Overpass availability can vary.

## Structure

```text
src/
  App.tsx
  main.tsx
  styles.css
  components/
    CampusScene.tsx
    CampusBoundary.tsx
    Terrain.tsx
    Lighting.tsx
    OSMBuildings.tsx
    BuildingWindows.tsx
    OSMRoads.tsx
    Vegetation.tsx
    POIObjects.tsx
    LocationLabels.tsx
    LoadingOverlay.tsx
    BuildingInfoPanel.tsx
    Ground.tsx              # original flat-ground utility, no longer mounted
  lib/
    sceneConfig.ts
    osm.ts
    geo.ts
    buildings.ts
    buildingGeometry.ts
    campus.ts
    roads.ts
    roadGeometry.ts
    digitalTwin.ts
    terrain.ts
    vegetation.ts
    roofMaterial.ts
    labels.ts
    camera.ts
  data/
    campus.ts
    buildingOverrides.ts
  types/
    scene.ts
    osm.ts
    campus.ts
```

No gallery, authentication, backend or AI features are implemented.
