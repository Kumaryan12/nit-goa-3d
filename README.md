# NIT Goa 3D Explorer

A full-viewport Vite, React, and TypeScript campus explorer built with Three.js, React Three Fiber, and Drei. Phase 2 loads real OpenStreetMap building ways and multipolygon relations from Overpass and extrudes their footprints. No buildings are invented or bundled as production placeholders.

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
- Edit `src/lib/sceneConfig.ts` to adjust scale, colors, camera, and sun placement.

## OpenStreetMap pipeline

`src/lib/osm.ts` first queries campus way `1259742369` using `map_to_area`, then fetches building ways and relations with `out geom;`. If that request fails or yields no usable polygons, it queries buildings within 900 meters of the origin. The footer identifies the nearby fallback when used, since it can include buildings outside campus.

The default endpoint is `https://overpass-api.de/api/interpreter`. To configure another instance, copy `.env.example` to `.env.local`, update `VITE_OVERPASS_ENDPOINT`, and restart Vite. Each request has a 45 second timeout; loading and error overlays leave the rest of the scene operational.

`geo.ts` converts GPS coordinates into local meters. `buildings.ts` validates closed rings, joins fragmented relation members, preserves courtyard holes, and avoids rendering relation members twice. Building height uses a positive numeric `height` (optional `m` suffix), then positive `building:levels × 3.2`, then 10 meters. Missing OSM heights therefore produce approximate extrusions, not surveyed building heights.

Buildings have a rough cream material, cast and receive sunlight shadows, and highlight on hover. Development builds log returned objects, mounted building meshes, query source, and coordinate origin, and show `Buildings loaded: XX`. OpenStreetMap contributor attribution is visible in the footer.

The real campus-area response used for regression tests contains 14 building ways and 8 building relations (22 footprints, 11 courtyard holes). Public Overpass availability and current OSM coverage can vary. Tests read a genuine recorded response; the application always fetches live data and never substitutes the test fixture.

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
    LoadingOverlay.tsx
  lib/
    sceneConfig.ts
    osm.ts
    geo.ts
    buildings.ts
    buildingGeometry.ts
  data/
    .gitkeep
  types/
    scene.ts
    osm.ts
```

`CampusScene` owns the Canvas, camera framing, sky, and OrbitControls. `Ground` owns the plane and grid helper. `Lighting` owns ambient light and directional sunlight. `OSMBuildings` owns the extruded meshes. `data/` is reserved for future campus data. No roads, vegetation, labels, information panels, gallery, or authentication are included.
