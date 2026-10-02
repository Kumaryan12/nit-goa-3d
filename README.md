# NIT Goa 3D Explorer

A full-viewport Vite, React, and TypeScript campus explorer built with Three.js, React Three Fiber, and Drei. Real OpenStreetMap ways and multipolygon relations provide the extruded footprints. Phase 6 adds ranked campus search, walking estimates, richer location cards, a community gallery foundation, dynamic statistics and a minimap. Terrain, terracotta roofs, instanced tropical vegetation, labels, campus boundary walls, day/night lighting and smooth camera navigation remain intact. No buildings or roads are invented or bundled as production placeholders.

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

`src/types/campus.ts` defines `CampusLocation` with a stable `id`, `name`, `category`, `description`, `keywords`, approximate local-meter `coordinates: { x, z }`, `height`, `icon`, `images` and `facilities`. Matched locations use the current OSM footprint center and rendered height; open POIs retain editable anchors. `images` is reserved for future verified photo URLs. `src/data/campus.ts` contains Academic Block, Administration Block, Boys Hostel, Girls Hostel, Canteen, Sports Ground, and Main Entrance. Categories also support amenities and other locations for later phases.

Hostel identities are grounded in named OSM footprints and [NIT Goa's hostel facilities page](https://nitgoa.ac.in/hostels/facilities.html): Talpona is the boys' hostel and Terekhol is the girls' hostel. General campus facilities are described in [NIT Goa's admission brochure](https://www.nitgoa.ac.in/uploads/Admissionbrochure30may2024.pdf).

The coordinate anchors are editable estimates. Academic, administration, and canteen identities are **provisional**, not independently verified building labels. `src/lib/campus.ts` first checks exact normalized OSM names against location names/keywords, then matches unnamed footprints to the nearest unused building location within 40 meters of the footprint's bounding-box center. Name matches take priority; each location and footprint can be assigned only once. Results are independent of Overpass result ordering. The panel marks proximity matches as approximate. Refine anchors in `campus.ts` as campus identities become known.

Sports Ground and Main Entrance have illustrative POI geometry at the existing approximate metadata anchors: a grass football field with white lines and goals, and an entrance gate with a short path to the nearest mapped road. They do not relabel unrelated buildings. These objects and landscaping are procedural visual additions, not surveyed OSM features. Unmatched footprints keep their OSM IDs and names (or `Unnamed campus building`) and remain clickable. Mesh `userData` carries both `osmId` and `locationId` for future connections. Photo previews use explicitly labelled illustration placeholders.

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
- **Navigation:** Drei CameraControls adds damped rotation, smooth wheel/pinch zoom and animated reset/fly-to. `src/lib/camera.ts` exports `lookupCameraLocation`, `flyToLocation` and `campusCameraView`. Quick location buttons and the existing information panel expose fly-to; unknown IDs return null. `CampusScene` is memoized so sampled performance updates do not rerender the 3D layers.
- **Loading:** Buildings and roads remain independent. A four-stage checklist shows Buildings, Roads, Terrain and Vegetation. Buildings are usable while roads load. A road error offers **Retry roads**, preserving the camera and current selection. A missing boundary renders no invented fence or trees.

### Verification

`npm test` includes the existing OSM and metadata tests plus height-priority/override, terrain generation/interpolation, road/building/boundary alignment, tree placement, courtyard-preserving roofs, label fading and camera lookup tests. `npm run build` checks all TypeScript and creates the production bundle.

The real recorded campus fixtures produce **22 buildings, 20 roads and 640 trees**. A nearby building fallback may include 23 buildings. During local browser inspection, the scene reported approximately **30 fps with Chrome Energy Saver enabled**, roughly **86–135 render calls** depending on the view, and **173–175k rendered triangles** including visible shadow work. Initial model generation measured about **103 ms** in Node on this machine. These are local development observations, not a cross-device benchmark; current live OSM counts and public Overpass availability can vary.

## Phase 6 exploration platform

- **Search:** `SearchBar` filters names, keywords, categories and facilities, requiring every query token to match. Exact names rank above prefixes, name fragments and keyword matches; ties are stable. Click a result or use Up/Down and Enter to select, open details and fly to it. Cmd/Ctrl+K focuses search; Escape closes results. The catalog includes the seven landmarks and current unnamed OSM buildings and accepts future locations without changing the search engine.
- **Information:** Cards show the category icon, facilities, approximate straight-line distance from the campus polygon's area centroid, the three nearest landmarks and location-linked demo photos. Quick buttons, nearby links and minimap footprints select the same stable location IDs. Open-space POIs can be selected without assigning a fake building ID.
- **Walking engine:** `createRoadGraph(roads, options)` splits centerline intersections and collinear overlaps into meter-weighted edges. Distinct OSM layers, bridges and tunnels remain separate. A* uses a Euclidean heuristic and priority queue. `findPath(start, end, graph)` returns local coordinates or `[]` when no connected route exists; `createPathfinder(roads, options).findPath(start, end)` provides the requested two-argument API. The shared graph is not mutated by queries.
- **Access and estimates:** Generic routing excludes private access by default. The campus explorer explicitly enables `allowPrivate: true`, because 17 of the 20 recorded campus roads have `access=private`; its UI explains that estimates assume authorized campus access. Explicit pedestrian prohibitions remain excluded. Motorist one-way does not imply pedestrian one-way; `oneway:foot` is respected. Anchors project onto the nearest mapped segment within 80 meters. Distances include the short straight-line anchor connections and assume 80 m/min walking speed; these approximate connectors do not establish verified door access or obstacle clearance. Disconnected networks are reported without invented road links.
- **Navigation mode:** “Navigate here” opens editable start/destination controls. The current-location placeholder uses Main Entrance, with a clear explanation that GPS is unavailable. Changing endpoints recalculates distance and time. Loading, unavailable, empty and disconnected road data have explicit UI states. Escape or the back button returns to location details. No arrows or route overlay are rendered.
- **Gallery:** `data/gallery.ts` contains eight demo entries linked by `locationId`. `GalleryPreview` accepts photo data as props, handles missing images and uses lazy loading. `types/gallery.ts` defines the async `GalleryRepository.getByLocation` contract and `lib/gallery.ts` provides a demo adapter for a future API. The shared SVG is a local illustration, clearly marked **Placeholder**, not a campus photo.
- **Dashboard and minimap:** Counts derive from the current loaded twin and generated trees. The recorded data has **22 buildings, 20 roadway ways, 193 centerline segments, 0 separately mapped footpaths and 640 trees**. “Road segments” counts consecutive centerline pairs, while the detail row counts OSM roadway objects. The north-up SVG overview preserves courtyard holes and displays the selected location anchor. Responsive glass panels support a 390 × 844 phone viewport.
- **Rendering:** The graph, search results, minimap geometry, distances and statistics are memoized; stable callbacks and memoized panels avoid metric-driven work. Unchanged metric samples do not trigger App renders. Vegetation retains three instanced meshes. Label portals stay in a stable canvas wrapper, preventing React DOM-root recreation when Fiber connects pointer events.

### Phase 6 verification and performance

`npm test`: **65 tests passed**, including 16 new tests in `search.test.mjs`, `pathfinding.test.mjs` and `platform.test.mjs`. They cover keyword/facility matching and ranking, graph intersections, shortest routes, snapping, disconnected/invalid networks, access/one-way/layer restrictions, real OSM routing, gallery linking, enriched metadata, dynamic statistics, centroid/nearby calculations and minimap holes/IDs. All 49 earlier geometry, road, metadata and visual-model regressions still pass.

`npm run build`: TypeScript and production Vite build pass. The Three.js application bundle remains over Vite's 500 kB chunk warning threshold (approximately 1.26 MB / 346 kB gzip); this is a bundle-size notice, not a build failure.

Browser checks covered keyboard hostel search → selection/card/camera flight, walking estimates, day/night lighting, minimap selection marker, and phone cards with scrollable facilities/photos/nearby links. A clean reload has no React errors; React Three Fiber still emits its upstream `THREE.Clock` deprecation warning.

For a controlled local comparison, the untouched Phase 5 commit `daaa415` and Phase 6 were opened in the same clean Chrome Guest window, at 100% page zoom, desktop home camera, DPR capped at 1.5 and without DevTools open. Both used the same genuine recorded OSM responses via a temporary QA endpoint to avoid public Overpass rate limits; the endpoint and fixtures are not a production fallback or application backend. Before/after samples: **60 FPS → 60 FPS**, **148 → 148 draw calls**, approximately **176k → 176k triangles**. Phase 6 also sampled around 60 FPS with location/navigation panels and the phone layout. This meets the 30 FPS target on this test machine; device/GPU, power settings and live OSM coverage affect actual performance.

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
    SearchBar.tsx
    NavigationMode.tsx
    GalleryPreview.tsx
    CampusStats.tsx
    MiniMap.tsx
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
    search.ts
    pathfinding.ts
    locations.ts
    gallery.ts
    stats.ts
    minimap.ts
  data/
    campus.ts
    buildingOverrides.ts
    gallery.ts
  types/
    scene.ts
    osm.ts
    campus.ts
    gallery.ts
```

Gallery previews are frontend demo data. Authentication, a database, real uploads, GPS, navigation arrows and AI assistance are not implemented.
