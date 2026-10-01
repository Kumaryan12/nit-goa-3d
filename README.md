# NIT Goa 3D Explorer

A full-viewport Vite, React, and TypeScript campus explorer built with Three.js, React Three Fiber, and Drei. Real OpenStreetMap ways and multipolygon relations provide the extruded footprints. Campus metadata supports clickable building information, and Phase 4 adds real campus roads and paths. No buildings or roads are invented or bundled as production placeholders.

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
- The ground starts at 400 × 400 meters and grows to cover the real campus boundary and building extents.
- The grid has 5 meter cells and can be toggled with the Grid button.
- The perspective camera starts at `[110, 110, 110]`, looking at the origin, then fits the real buildings from an isometric angle. Viewport resizing refits the view; toggling the grid preserves it.
- Drag to orbit, scroll to zoom, and right-drag to pan. On touchscreens, use one finger to orbit and two fingers to zoom or pan.
- Click a building to show its name, category, and description. Close the information panel with its close button, Escape, or a click on empty scene space. Selected buildings remain highlighted; selecting or dismissing a building preserves the camera.
- Edit `src/lib/sceneConfig.ts` to adjust scale, colors, camera, and sun placement.

## OpenStreetMap pipeline

`src/lib/osm.ts` first queries campus way `1259742369` using `map_to_area`, then fetches building ways and relations with `out geom;`. If that request fails or yields no usable polygons, it queries buildings within 900 meters of the origin. The footer identifies the nearby fallback when used, since it can include buildings outside campus.

The default endpoint is `https://overpass-api.de/api/interpreter`. To configure another instance, copy `.env.example` to `.env.local`, update `VITE_OVERPASS_ENDPOINT`, and restart Vite. Each request has a 45 second timeout; loading and error overlays leave the rest of the scene operational.

`geo.ts` converts GPS coordinates into local meters. `buildings.ts` validates closed rings, joins fragmented relation members, preserves courtyard holes, and avoids rendering relation members twice. Building height uses a positive numeric `height` (optional `m` suffix), then positive `building:levels × 3.2`, then 10 meters. Missing OSM heights therefore produce approximate extrusions, not surveyed building heights.

Buildings have a rough cream material, cast and receive sunlight shadows, and highlight on hover. Development builds log returned objects, mounted building meshes, query source, and coordinate origin, and show `Buildings loaded: XX`. OpenStreetMap contributor attribution is visible in the footer.

The real campus-area response used for regression tests contains 14 building ways and 8 building relations (22 footprints, 11 courtyard holes). Public Overpass availability and current OSM coverage can vary. Tests read a genuine recorded response; the application always fetches live data and never substitutes the test fixture.

## Campus metadata

`src/types/campus.ts` defines `CampusLocation` with a stable `id`, `name`, `category`, `description`, `keywords`, and approximate local-meter `coordinates: { x, z }`. `src/data/campus.ts` contains Academic Block, Administration Block, Boys Hostel, Girls Hostel, Canteen, Sports Ground, and Main Entrance. Categories also support amenities and other locations for later phases.

Hostel identities are grounded in named OSM footprints and [NIT Goa's hostel facilities page](https://nitgoa.ac.in/hostels/facilities.html): Talpona is the boys' hostel and Terekhol is the girls' hostel. General campus facilities are described in [NIT Goa's admission brochure](https://www.nitgoa.ac.in/uploads/Admissionbrochure30may2024.pdf).

The coordinate anchors are editable estimates. Academic, administration, and canteen identities are **provisional**, not independently verified building labels. `src/lib/campus.ts` first checks exact normalized OSM names against location names/keywords, then matches unnamed footprints to the nearest unused building location within 40 meters of the footprint's bounding-box center. Name matches take priority; each location and footprint can be assigned only once. Results are independent of Overpass result ordering. The panel marks proximity matches as approximate. Refine anchors in `campus.ts` as campus identities become known.

Sports Ground and Main Entrance are metadata-only open places in this phase; they do not relabel unrelated buildings or generate additional geometry. Unmatched footprints keep their OSM IDs and names (or `Unnamed campus building`) and remain clickable. Mesh `userData` carries both `osmId` and `locationId` for future connections. No gallery is implemented.

## Campus roads

`fetchCampusRoads` in `src/lib/osm.ts` uses a separate campus-area `highway=*` query with `out geom;`. This includes service roads, footways, and paths. If the area request fails or yields no usable roads, the loader uses the real campus boundary in a polygon Overpass query. Roads never use the building loader's 900 meter fallback. A missing boundary fails safely; a successful empty response displays a no-mapped-roads message.

`src/lib/roads.ts` converts GPS centerlines through the same `gpsToLocal` function as buildings, removes consecutive duplicate coordinates, rejects malformed geometry, and clips centerlines to the campus polygon, including concave boundaries. Linear road and footpath classifications are supported; proposed/construction features and `area=yes` plazas are excluded. Width uses a valid OSM `width` tag (0.3–30 m), otherwise estimated defaults: service roads 4.5 m, driveways/tracks 3 m, other roads 6 m, footpaths 1.8 m, cycleways 2.5 m.

`src/lib/roadGeometry.ts` builds flat mesh ribbons in world X/Z with shared, bounded miter joins. Asphalt roads sit at Y = 0.06 m and lighter footpaths at Y = 0.08 m, above both ground and the grid. Materials are rough and receive building shadows. `OSMRoads` has no pointer handlers, so building selection remains available. Road loading/error state is independent of building state, and road arrival does not reset the camera or selected building.

The live response recorded for tests has 20 service-road ways and no separately mapped footways/paths. Rendering follows current OSM coverage without generating missing routes. Tests cover cardinal coordinate conversion, real-road conversion, campus clipping, ribbon geometry, and Overpass fallback/error/cancellation handling. No textures, trees, or gallery are included.

## Structure

```text
src/
  App.tsx
  main.tsx
  styles.css
  components/
    CampusScene.tsx
    Ground.tsx
    Lighting.tsx
    OSMBuildings.tsx
    OSMRoads.tsx
    LoadingOverlay.tsx
    BuildingInfoPanel.tsx
  lib/
    sceneConfig.ts
    osm.ts
    geo.ts
    buildings.ts
    buildingGeometry.ts
    campus.ts
    roads.ts
    roadGeometry.ts
  data/
    campus.ts
  types/
    scene.ts
    osm.ts
    campus.ts
```

`CampusScene` owns the Canvas, camera framing, sky, and OrbitControls. `Ground` owns the plane and grid helper. `Lighting` owns ambient light and directional sunlight. `OSMBuildings` owns the extruded meshes and building selection. `OSMRoads` owns the road meshes. `BuildingInfoPanel` displays the selected location. No vegetation, map labels, gallery, or authentication are included.
