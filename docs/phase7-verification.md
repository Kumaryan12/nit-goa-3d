# Phase 7 verification record

Recorded on 2026-10-02. Browser QA used Chrome Guest, the existing genuine recorded OSM building/road responses through a temporary local endpoint, and zero Supabase configuration. The temporary endpoint, synthetic image and browser image-processing page were removed from production assets. Test fixtures remain test-only; production uses live Overpass or a browser cache of previously successful real data.

## Implementation and validation

- **142 tests passed: 77 added, all 65 existing tests retained.** New coverage includes turns/noise/distance, traveler interpolation, portrait/short/narrow camera framing, URL parsing/invalid IDs/base paths, demo filtering/location linking, verified-identity adapter mutations, immutable owner uploads, lost-response recovery, retry duplication, image validation/header/size calculations, public configuration validation, optimistic rollback, cache serialization/version/freshness/offline/abort and bounded HTTP retries.
- Ten tests execute the actual SQL migration in PGlite PostgreSQL with Supabase-style auth/storage stubs and roles. They exercise anonymous/owner reads, identity spoofing, pending insertion, self-approval denial, grant restrictions, likes/counters/unlike ownership, owner deletion, storage owner/path/type policies and private unique reports. They do not emulate hosted Auth or Storage HTTP behavior.
- A fresh detached worktree with no local environment settings passed **`npm install`, all 142 tests, `npm run build` and `npm run dev` startup**. The dev query URL responded; production HTML references relative asset URLs, and disposable QA assets were absent from `dist`.
- `npm run build` passes TypeScript and production Vite compilation. The remaining >500 kB scene chunk notice is documented; it is not suppressed.
- `npm audit --omit=dev` reports zero known vulnerabilities at verification time.
- Security inspection found no HTML injection APIs, production Mac-specific paths or committed privileged credentials. Repository identity comes from `auth.getUser()`, deletion/unlike queries include owner filters, schema/RLS enforce status/ownership and storage is private. Image decode has byte/pixel bounds, canvas re-encoding removes original metadata, and stable UUID/ref locks plus immutable storage/DB uniqueness limit duplicates.

## Browser flows

| Flow | Observed result |
| --- | --- |
| A: Boys Hostel search → Navigate here → Main Entrance → View route → preview/pause/2x/resume/stop | Completed; route visible in 3D and minimap, camera fits route, preview controls update correctly. |
| B: Academic Block → info/community photos → Gallery → Academic filter | Completed; two labelled demo cards, eight total campus entries. |
| C: Upload entry/anonymous/demo behavior | Dialog has editable location/caption, privacy/type/size guidance and disabled persistence in demo. Anonymous like opens demo authentication explanation. Cancelling the native file chooser keeps upload open. |
| D: Night route | Cyan route visible over asphalt, endpoint labels and minimap route visible; building windows/selection preserved. |
| E: 390 × 844 | Keyboard hostel search, info card, route/directions scrolling, collapsible panels, map orbit, gallery, full viewer and upload form inspected. |
| E: 360 × 800 and 430 × 932 | Navigation layout at 360, gallery/viewer and upload forms inspected across these emulated sizes. Controls fit; dialogs/directions can scroll. No physical phone testing. |
| F: Overpass failure | After successful cache population, endpoint returned HTTP 503. Bounded retries/fallback exhausted, then buildings and roads restored with “Using cached map data”, age and correct campus counts. Restoring live responses removed the cached banner. |
| URLs/history | Location/route reload, photo query reload, photo keyboard arrows, Escape removing photo, and browser Back/Forward restoring photo inspected. |

The QA route was **Main Entrance → Boys Hostel, 952.8805 m (953 m displayed), 12 minutes, 10 instructions including arrival**. Approximately 24 m are explicitly unverified anchor connections. Campus access and 80 m/min are assumptions; this is not verified door-to-door guidance.

Campus counts: **22 buildings, 20 OSM road ways, 193 centerline segments, 0 separately mapped footpaths, 640 instanced trees**. Live OSM coverage may differ.

Desktop local samples: **60 FPS, 153–155 draw calls, approximately 177k triangles** during route/day/night views. Phase 6 home-view observations were 60 FPS/148 calls/176k triangles; different views do not establish a renderer speedup. Mobile emulation also sampled 60 FPS on the same desktop GPU.

No uncaught application/React errors were observed. Deliberate 503 failures produced expected resource errors and handled loader warnings; clean successful reload had only React Three Fiber's upstream `THREE.Clock` deprecation warning. Browser Issues form-name notices found during QA were corrected with named controls.

## Browser image processing

Native file-picker automation could navigate to and preview the generated PNG but could not enable its Open action. Consequently, selecting a file into the actual upload input was not fully verified in automation. A disposable local browser QA page called the same `processImage` implementation directly after an explicit button click:

- Input: generated 1200 × 800 PNG, approximately 5 kB.
- Processed original: 1200 × 800 `image/webp`, **3,742 bytes**.
- Thumbnail: 480 × 320 `image/webp`, **1,184 bytes**.
- Processed image rendered successfully; no upload was transmitted.

This verifies browser decoding/canvas/WebP processing for that PNG. JPEG/WebP validation and resize math have unit coverage; rotated-camera JPEGs and a hosted end-to-end contribution still need a deployment smoke test.

## Supabase and remaining limits

**Supabase was not configured, provisioned or contacted during browser QA. Gallery mode was demo.** Hosted magic-link delivery, real authenticated upload, object URL issuance and SDK behavior against the deployed policies are not claimed as verified. Migration policies run successfully under PostgreSQL tests, and adapter operations have injected-client tests.

The deployment owner must apply the migration, retain the private 4 MiB/WebP bucket, configure email delivery and Auth redirect URLs, and test with separate anonymous/owner/other-user sessions. Setup and manual moderation are documented in README.

Additional limits: provisional anchors/building identities, procedural elevation/POIs, missing OSM pedestrian mapping, no GPS/Follow mode, 60-photo query cap without pagination, session-only gallery cache, no service worker, one-hour signed URL revocation delay, non-atomic storage/metadata deletion and retained orphan objects after uncertain failure. Direct API clients can bypass browser validation: trusted server content decoding/re-encoding and quotas/rate limits are future operational hardening. No comments, social features or admin UI were added.

## Bundle measurements

Vite decimal kB, minified/gzip. Initial entry: **1,257.37 / 346.42 before → 278.53 / 87.90 after**. Entry reduction is approximately 78%; the 3D scene still loads soon afterward. Entry + scene/shared/model is approximately **1,305 / 364.51**, so total full-campus JS did not shrink. Optional tools are genuinely deferred.

| Lazy/shared chunk | Minified kB | Gzip kB |
| --- | ---: | ---: |
| CampusScene | 642.94 | 172.83 |
| Campus/Three shared module | 381.61 | 102.58 |
| DigitalTwin | 2.38 | 1.20 |
| Supabase SDK | 214.18 | 55.01 |
| SupabaseGalleryRepository | 4.92 | 1.90 |
| GalleryModal | 4.87 | 2.02 |
| PhotoViewer | 2.82 | 1.33 |
| PhotoUploadDialog | 6.22 | 2.75 |
| AuthDialog | 1.48 | 0.83 |
| useAuth | 0.68 | 0.43 |
| Modal | 0.76 | 0.45 |

## Created files

```text
docs/phase7-verification.md
src/components/AuthDialog.tsx
src/components/DirectionsPanel.tsx
src/components/ErrorBoundary.tsx
src/components/GalleryModal.tsx
src/components/Modal.tsx
src/components/PhotoUploadDialog.tsx
src/components/PhotoViewer.tsx
src/components/RouteOverlay.tsx
src/components/RouteTraveler.tsx
src/hooks/useAuth.ts
src/hooks/useDigitalTwin.ts
src/lib/directions.ts
src/lib/fetchStrategy.ts
src/lib/images.ts
src/lib/osmCache.ts
src/lib/supabase.ts
src/lib/traversal.ts
src/lib/urlState.ts
src/repositories/DemoGalleryRepository.ts
src/repositories/SupabaseGalleryRepository.ts
src/repositories/createGalleryRepository.ts
supabase/migrations/001_gallery.sql
tests/galleryRLS.test.mjs
tests/phase7.test.mjs
```

## Modified files

```text
.env.example
README.md
package.json
package-lock.json
vite.config.ts
src/App.tsx
src/components/BuildingInfoPanel.tsx
src/components/CampusScene.tsx
src/components/GalleryPreview.tsx
src/components/MiniMap.tsx
src/components/NavigationMode.tsx
src/data/gallery.ts
src/lib/camera.ts
src/lib/gallery.ts
src/lib/osm.ts
src/styles.css
src/types/gallery.ts
```
