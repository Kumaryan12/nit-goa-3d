# NIT Goa 3D Explorer

A full-viewport campus explorer using Vite, React, TypeScript, Three.js, React Three Fiber and Drei. Phase 7 adds visible walking routes, traversal previews, directions, shareable URLs, a community gallery with optional Supabase persistence, and resilient map loading. Existing OSM footprints, roofs, terrain, boundary, 640 instanced trees, search, selection, day/night lighting and minimap remain intact.

## Run and verify

Use Node.js 22.12+ or a supported newer version. No Supabase configuration is needed to explore campus and browse labelled demo illustrations.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
```

Tests use Node's TypeScript stripping and recorded genuine OSM responses. PostgreSQL security tests use development-only PGlite; neither PGlite nor test map fixtures are included in the application. See [Phase 7 verification](docs/phase7-verification.md) for results, changed files and QA limitations.

## Architecture

`App.tsx` coordinates selection, URL state, independently loaded buildings/roads, navigation and optional dialogs. `CampusScene.tsx` owns the Fiber Canvas. Geometry and domain utilities live in `src/lib`; editable campus anchors and height overrides live in `src/data`; interfaces live in `src/types`. `useDigitalTwin` asynchronously loads and memoizes terrain, vegetation and metadata derivation. Existing architecture is preserved; there is no mapping-framework replacement or React Router.

| System | Main files |
| --- | --- |
| OSM coordinates and parsing | `lib/osm.ts`, `geo.ts`, `buildings.ts`, `roads.ts` |
| 3D campus | `components/CampusScene.tsx`, `OSMBuildings.tsx`, `OSMRoads.tsx`, `Terrain.tsx`, `CampusBoundary.tsx`, `Vegetation.tsx` |
| Metadata/search/selection | `data/campus.ts`, `data/buildingOverrides.ts`, `lib/campus.ts`, `SearchBar.tsx`, `BuildingInfoPanel.tsx` |
| Navigation | `lib/pathfinding.ts`, `directions.ts`, `traversal.ts`, `camera.ts`, `RouteOverlay.tsx`, `RouteTraveler.tsx`, `DirectionsPanel.tsx`, `NavigationMode.tsx` |
| Community gallery | `types/gallery.ts`, `repositories/`, `GalleryPreview.tsx`, `GalleryModal.tsx`, `PhotoViewer.tsx`, `PhotoUploadDialog.tsx` |
| Backend/auth | `lib/supabase.ts`, `hooks/useAuth.ts`, `AuthDialog.tsx`, `supabase/migrations/001_gallery.sql` |
| Resilience/accessibility | `lib/fetchStrategy.ts`, `osmCache.ts`, `urlState.ts`, `components/Modal.tsx`, `ErrorBoundary.tsx` |

## 3D/GIS pipeline and data honesty

One world unit is approximately one meter. GPS origin is latitude `15.16773`, longitude `74.01548`; east is +X, north is -Z and Y is up. Drag to orbit, scroll to zoom, right-drag to pan; touch supports one-finger orbit and two-finger pan/zoom. Grid cells are 5 m and the grid starts disabled.

The building loader queries campus way `1259742369` with Overpass `map_to_area` and `out geom`. Ways and assembled multipolygon relations become validated closed footprint rings with preserved courtyard holes; relation members are not rendered twice. If the campus query fails or has no usable footprints, buildings within 900 m of the origin are requested. This nearby fallback is labelled because it can include buildings outside campus.

Height priority is a valid OSM `height`, then `building:levels × 3.2`, then a matched editable override, then 10 m. Cream concrete, terracotta roofs, tile shaders and instanced emissive windows are visual treatments. The real recorded campus-area response has **22 footprints, including 8 relations and 11 courtyard holes**. Live coverage can change.

Roads independently query `highway=*`, including service roads, footways and paths. An area failure falls back to the real campus polygon, never the building radius. GPS centerlines become local X/Z meters, are deduplicated and clipped to the campus boundary, then rendered as bounded-miter ribbons. Construction/proposed ways and area plazas are excluded. Width follows valid OSM width tags, otherwise estimated road/footpath defaults. Asphalt sits 0.06 m above flat built terrain; footpaths use lighter material at 0.08 m. Road meshes do not intercept building selection.

The recorded response contains **20 service-road ways, 193 centerline segments and no separately mapped footways**. The application does not invent missing roads or use fixtures as an offline production substitute.

Terrain is deterministic procedural elevation, approximately 0–2.1 m in open areas, with flat clearance around built features. Boundary panels follow the OSM polygon. Three instanced meshes render 640 seeded trees with road/building/POI clearance; tree placement waits for both map requests to settle. Terrain, field/gate geometry and landscaping are illustrative, not surveyed elevations or structures.

The seven main locations are Academic Block, Administration Block, Boys Hostel, Girls Hostel, Canteen, Sports Ground and Main Entrance. Named OSM buildings take precedence over proximity matches within 40 m, with one-to-one deterministic assignment. Talpona/Terekhol hostel identities have OSM name support. Academic, administration and canteen proximity assignments are provisional. Sports-field/entrance anchors and door connections are approximate. Unmatched buildings retain their OSM IDs, names and click behavior. These distinctions remain visible in the UI.

## Search, navigation and URLs

Search names, keywords, categories and facilities. Exact names rank first. Up/Down and Enter select results, Cmd/Ctrl+K focuses search, and Escape closes suggestions. Selection opens information, highlights the footprint, updates the minimap and flies the camera to the location. Cards include facilities, nearest landmarks, estimated distance from campus centroid and location-linked community photos.

The walking graph splits mapped centerline intersections/overlaps into meter-weighted edges. A* uses a Euclidean heuristic and priority queue. Layers, tunnels and bridges remain separate; pedestrian prohibitions and `oneway:foot` are respected. Generic routing excludes private roads by default; campus routing explicitly allows them because 17 recorded roads are private, with an authorized-access assumption in the UI.

Anchors project onto the nearest road within 80 m. Disconnected/unavailable networks show errors instead of invented shortcuts. Approximate straight connectors count toward total distance; walking time assumes 80 m/min. Main Entrance is the explicit current-location placeholder; GPS is not implemented.

`RouteOverlay` follows the exact A* polyline, with short linear subdivisions sampling terrain. A memoized flat ribbon keeps geometry light and avoids corner-cutting; elevated polygon offset keeps it visible above roads at campus scale. Blue/cyan indicates mapped route; dashed gold indicates unverified anchor connections. Camera-facing START/DESTINATION labels are non-interactive. “View route” frames the complete bounding box, including portrait and short/narrow routes, then leaves manual camera controls available.

Directions simplify heading noise for instructions only; the rendered route and measured distance retain the original path. Steps classify continue, slight/normal/sharp turns and arrival, merging small bends. Preview walk uses cumulative physical distance, interpolation and refs/`useFrame`, with pause/resume/restart/stop and 1x/2x/4x speeds. The north-up minimap displays route, endpoints and traveler with direct SVG updates. A* and React state are not recomputed each animation frame. Reduced motion disables animated camera transitions; traversal starts only on an explicit user action.

Share examples:

```text
/?location=boys-hostel
/?from=main-entrance&to=boys-hostel&mode=night
/?photo=academic-evening-demo
```

Query helpers validate IDs, preserve unrelated query parameters and deployment paths, and update history without reloads. Back/Forward restores meaningful selection, route, night and photo state. Unknown IDs fail gracefully. Photos reload directly by repository ID; closing removes `photo`. Modal openness, playback progress and other transient UI are omitted from URLs.

## Correct campus names and positions

Use **Edit campus** in the toolbar, or **Edit name / location** in a selected building's details.

- **Main Entrance / Sports Ground:** select the location, click **Pick new position on map**, orbit or zoom as needed, then click the ground. A gold marker previews the position. Click **Save changes** to apply it; rotation is editable in degrees. Moving the entrance updates its gate, boundary opening, labels and route start. Moving the sports ground updates its field and terrain clearing.
- **Buildings:** change the name and save. If a landmark is attached to the wrong building, select that landmark and use **Choose correct building on map** to pick the actual OSM footprint. A manual assignment takes priority over approximate proximity matching. Real footprint geometry stays fixed.
- **Reset local edit** restores the project's current default for that location. Stable location IDs preserve navigation URLs and gallery associations even after renaming.

Edits persist in this browser under `nit-goa:location-edits:v1`; they do not change OpenStreetMap or other visitors' maps. **Export corrections** downloads `campus-overrides.json` containing saved edits. To publish confirmed corrections for everyone, put that JSON object into the typed `savedCampusOverrides` export in `src/data/campusOverrides.ts`, run tests/build, then commit and deploy. Browser edits take priority over those project defaults. The project defaults include the owner's exported corrections for Main Entrance, Sports Ground (including its 90° rotation), Canteen, Administration Block, Nescafe, Gyan Mandir, Seminar Complex and Vikram Sarabhai (ECE).

Coordinates use local meters: +X east, +Z south, origin 15.16773° N / 74.01548° E. The editor also displays latitude/longitude. Placement raycasts the displayed terrain and is intended for campus metadata corrections, not surveying.

## Nescafe / sports-ground elevation

When a corrected OSM building is named **Nescafe** (also accepts Nescafé), the terrain creates an upper terrace around its real footprint and a lower, level sports field at the edited Sports Ground position. A smooth slope connects them. The editable estimate in `src/data/topography.ts` starts at **8 meters of relative height**; this represents the campus owner's description, not surveyed elevation or OSM elevation data. Without an identifiable Nescafe building, the earlier terrain remains available until that identity is assigned.

Buildings and their windows use a level foundation at their local terrace height. Roads and the entrance pathway are subdivided and draped over terrain; labels, fly-to targets, boundary fencing, vegetation, route overlays and the walking marker use the same surface. X/Z building footprints, road centerlines and selection identities are preserved. Walking distance/time remain planar OSM-network estimates and do not model slope effort or accessibility.

Move Sports Ground in the editor to redirect the slope automatically. Renaming or choosing Nescafe's footprint updates the upper anchor. The owner's exported layout is now included in `src/data/campusOverrides.ts`, so this slope activates for new visitors after OSM buildings load. Export subsequent browser corrections into that file to update the shared layout.

## Gallery and demo mode

The UI uses `GalleryRepository`, not SDK calls for data operations. `GalleryPhoto` includes location, storage path, original/thumbnail URLs, author, timestamps, dimensions, pending/approved/rejected status and likes. Repository methods provide latest/popular/location queries, lookup, upload, owner deletion, likes/unlikes and reporting.

With no valid public configuration, `DemoGalleryRepository` returns eight explicitly labelled illustrations. Demo mode never pretends to save uploads, accounts, likes or reports. Browsing requires no sign-in. Latest/Popular and location filters, lazy thumbnails, full viewer, keyboard arrows, Escape and swipe navigation are available. Empty real locations invite the first contribution. Anonymous contribution/like/report actions signpost authentication when configured.

`createGalleryRepository()` dynamically selects the Supabase adapter when both public settings are valid; malformed or privileged key configuration falls back safely to demo. The SDK, repository and optional gallery/auth/upload/viewer dialogs are separate lazy chunks. Optional backend/render failures are contained by an error boundary so the campus can remain usable.

## Supabase configuration and migration

1. Create a Supabase project in your own account.
2. In SQL Editor, run **`supabase/migrations/001_gallery.sql` once** as the project owner. It creates `profiles`, `photos`, `photo_likes`, `photo_reports`, constraints/indexes/triggers, grants/RLS policies and the private `campus-gallery` bucket. Use a new migration for future changes; the initial migration is deliberately not a repeatable reset script.
3. Confirm the bucket is **private**, allows only `image/webp`, and has a **4 MiB per-object limit**. Do not change it to public: pending media must remain private.
4. Enable email magic-link sign-in. Configure Auth Site URL and redirect allowlist for local and deployed origins/paths. Configure appropriate email delivery/SMTP for your deployment and verify a real email link. Account identity is verified with `auth.getUser()` before repository mutations.
5. Copy `.env.example` to `.env.local`, set the project URL and its **publishable key or legacy anon key**, then restart Vite. Production builds receive these settings at build time.

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_OVERPASS_ENDPOINT=https://overpass-api.de/api/interpreter
```

These are public browser settings. Never put a service-role key, database password or administrative secret in frontend environment variables. The public configuration validator rejects recognized privileged keys, but server policy enforcement remains essential.

Storage paths are immutable and scoped to the authenticated identity:

```text
userId/photoUUID/original.webp
userId/photoUUID/thumbnail.webp
```

Uploads use `upsert: false`. Read access to approved media uses **one-hour signed URLs**, created through storage RLS. Owners can read their pending objects; anonymous users cannot. Current Supabase [storage access-control guidance](https://supabase.com/docs/guides/storage/security/access-control) explains the separate object policies; the [bucket documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals) explains private reads and bucket MIME/size limits.

## Uploads, privacy and security

The image dialog preselects a location when opened from its card, allows changes, preserves the caption on retry and reports Preparing/Uploading/Submitting/Complete. Browser processing accepts JPEG/PNG/WebP input up to **12 MiB and 32 megapixels**. Signature/dimension checks precede decoding, orientation follows browser image decoding, long edge is capped at 2048 px, and thumbnails at 480 px without upscaling. Canvas re-encodes both as WebP, removing original EXIF/GPS metadata rather than intentionally preserving it. Preview blob URLs and decoded bitmap resources are released.

The UI locks concurrent submission, and a stable photo UUID survives retries. The adapter recovers owned submissions after lost responses and reuses immutable owner objects without duplicating metadata. Pending confirmation does not claim public publication. Offline upload is disabled; auth expiry, processing, storage and database failures show retryable messages.

RLS/grants enforce approved-only anonymous reads, pending-only own insertion, owner-only deletion and no ordinary photo UPDATE/approval permission. Like/report insertion requires approved photos and the current authenticated identity. Likes have unique user/photo pairs and trigger-maintained atomic counts; unlike scopes to the current identity. Reports are unique per reporter/photo and private to moderators. Storage insertion validates bucket, owner prefix, UUID/object name and WebP MIME metadata; no client storage UPDATE policy exists. React renders captions/names/reasons as text, without HTML injection APIs.

Manual moderation: inspect pending photo metadata and original/thumbnail objects through the Supabase dashboard; verify consent, campus association and content before changing `status` to `approved` or `rejected`. Review private reports there. Ordinary users have no moderation controls. Optional profile display names are owner-managed and snapshot on submission; otherwise the author label is “Campus member”.

Remaining security/operational work before a large public launch: direct API callers can bypass browser byte checks, so MIME/path restrictions are not server-side content decoding. Add a trusted server image-validation/re-encoding pipeline, abuse/rate limits, quotas and operational monitoring as usage grows. Signed URLs already issued can remain usable until expiry after moderation changes. Storage/metadata deletion is not atomic; uncertain submissions intentionally retain retry objects, so periodically reconcile orphaned storage through supported Storage APIs/dashboard (do not delete only storage metadata in SQL). No privileged keys were used or deployed during Phase 7 QA.

## Map cache, retries and offline behavior

`osmCache.ts` stores the last successful processed building and road payloads separately in localStorage, with schema version and timestamp. Geometry/metadata validation rejects malformed or oversized cache entries; invalid versions/future timestamps are rejected and quota/disabled-storage failures do not crash the map. Freshness is 24 hours. Older data can still be offered during failure and is labelled stale.

Live Overpass is preferred while online. Shared requests retry network failures, 429 and 5xx with bounded exponential backoff/jitter; ordinary 4xx are not retried. Defaults permit three attempts per query, 15-second attempt timeouts and a 45-second total query deadline. Fallback queries have their own bounded request budget. Lifecycle aborts stop requests/backoff and do not silently restore caches. `VITE_OVERPASS_ENDPOINT` selects one public or self-hosted endpoint; the app does not fan out across public servers.

Failed live requests restore a valid cache with **“Using cached map data”**, age and staleness. Browser offline events use cached maps immediately; no-cache offline state gives a useful error and Retry action. Buildings and roads remain independent. Configured gallery content has a session memory cache; demo remains available offline. Gallery image availability still depends on browser caching and signed URL expiry. This is not a fully offline PWA: a first offline visit cannot fetch application bundles, and no service worker is installed.

## Accessibility and mobile

Native modal dialogs provide top-layer focus containment, background inertness, Escape and opener focus restoration. Buttons have accessible names, image alternatives identify demo illustrations, forms have labels/names, and gallery/auth loading uses restrained skeletons. Search supports keyboard selection; the photo viewer supports arrows and Escape. The canvas has a useful accessible surrounding description, search and minimap selection; individual 3D geometry is not a fully screen-reader navigable map.

Day/night colors remain readable. Reduced-motion CSS removes UI transitions; walking preview never auto-starts. Mobile information and navigation panels scroll and collapse above the minimap/statistics, leaving the map usable. Browser emulation checked 390 × 844, 360 × 800 and 430 × 932; this is not a physical-device compatibility certification.

## Measured performance

Vite output uses decimal kB and gzip estimates. Phase 6 initial JS was **1,257.37 kB / 346.42 kB gzip**. Phase 7 entry is **278.53 kB / 87.90 kB gzip**, about 78% smaller before the scene loads. Gallery and Supabase stay deferred until used.

| Chunk | Minified kB | Gzip kB |
| --- | ---: | ---: |
| Initial entry | 278.53 | 87.90 |
| CampusScene | 642.94 | 172.83 |
| Shared campus/Three module | 381.61 | 102.58 |
| Digital twin model | 2.38 | 1.20 |
| Supabase SDK | 214.18 | 55.01 |
| Supabase gallery adapter | 4.92 | 1.90 |
| GalleryModal | 4.87 | 2.02 |
| PhotoViewer | 2.82 | 1.33 |
| PhotoUploadDialog | 6.22 | 2.75 |
| AuthDialog | 1.48 | 0.83 |

The 3D scene loads immediately after the shell; entry + scene/shared/model total approximately **1,305 kB / 364.51 kB gzip**, so splitting does not reduce the total JS required to view the complete campus. It improves initial scheduling and defers optional features. The 643 kB scene still triggers Vite's 500 kB notice; the build succeeds.

On the local Chrome Guest QA machine, desktop route/day/night interactions sampled **60 FPS**, approximately **153–155 draw calls and 177k triangles**. Prior Phase 6 home-camera observations were 60 FPS, 148 calls and 176k triangles; these are different views, not a claimed renderer speedup. DPR remains capped at 1.5, trees stay instanced, route geometry is memoized/disposed and traveler animation avoids per-frame React updates. Performance depends on GPU, power settings and OSM coverage.

## Static deployment

Build with `npm run build` and serve `dist/` over HTTPS on a static host. Set public environment variables before building. Vite uses a relative asset base and demo images follow `import.meta.env.BASE_URL`, supporting root hosting and subdirectories such as GitHub Pages. Query-only deep links use the same index document and require no client-route rewrite; preserve the deployment directory/trailing slash in links. Configure Supabase Auth redirects to the actual deployed URL.

Keep source `.env.local` ignored; publish only `dist`, never private operational credentials. A zero-configuration build remains a functional demo gallery and live/cached OSM explorer. Live hosted auth/storage/database operations still require project provisioning and an end-to-end deployment smoke test.
