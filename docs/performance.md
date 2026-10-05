# Campus rendering and download performance

The October 2026 performance release reduces main-thread construction, unnecessary rendering and public asset transfer. Terrain resolution and the ground/collision sampler are unchanged.

## Graphics controls

The toolbar's Graphics control persists locally. Auto starts conservatively, lowers quality after four seconds below 42 fps, raises it after twelve seconds at or above 56 fps, and waits sixteen seconds between changes. Hidden/unfocused tabs and long resume gaps do not influence adaptation. Coarse-pointer and low-core devices start at the lowest level and cannot automatically climb to the highest level.

| Setting | DPR cap | Shadow map | Facade detail | Moving shadow refresh |
| --- | --- | --- | --- | --- |
| Smooth | 0.85 | 1024 | Within 120 m of building bounds | 10 Hz |
| Auto | 0.85–1.5 | 1024–2048 | 120–320 m | 10–20 Hz |
| Detailed | 1.5 | 2048 | All distances | 20 Hz |

Nearby detail has a 20 m hysteresis band to avoid flicker. A selected building always retains its facade details. Main building masses, window panes and principal roofs remain visible at every level. Night street and interior lighting remain available.

## Construction and rendering

- A module worker builds the digital twin, its terrain patches and both interior plans. It transfers typed-array buffers instead of copying them. Rapid terrain/location changes terminate obsolete workers; sequence checks prevent stale results. Browsers without usable workers retain the main-thread fallback.
- The original 512-grid campus terrain has 524,356 triangles, including canal clipping. All original triangles, colours and normals are retained across 64 patches. Patch bounds allow Three.js to cull off-screen ground. The physics sampler and slope settings are unchanged.
- Gyan Mandir and Boys Hostel furniture/walls mount after entry. Outdoor exploration retains the full exterior shell and entry signs. Only the current floor and necessary stair transition floors mount inside.
- Static scene components are memoized, geometry options stay stable, and generated geometries/materials are disposed on replacement. Trees and gardens remain instanced.
- Overview shadows are cached until terrain, lighting, interior or facade visibility changes. Walking, live avatars, football, concerts and route playback enable rate-limited updates. Rendering pauses while the page is hidden and resumes on return.

## Asset delivery

`npm run build` prepares Brotli and gzip variants for text assets at least 512 bytes long. The runtime negotiates Accept-Encoding, honours exclusions and falls back to identity when allowed. Compression runs at build time, outside live request handling. Hashed assets retain immutable caching; HTML and maps use ETags with cache revalidation. HEAD requests preserve representation headers without a response body. API and credential routes remain outside this public static handler.

The local build compressed 25 files from approximately 2,017 KiB to 515 KiB Brotli, a 74% reduction in their aggregate transfer size. This total includes optional chunks and map files; it is not a measurement of one visitor's initial download. The worker is an additional small download and GPU buffer upload still occurs on the main thread. The free Render service's cold start remains an infrastructure limit.

## Validation

351 automated tests passed, including exact triangle/attribute conservation, raycast equivalence and canal openings, frustum culling, sustained adaptation and hysteresis, the real worker's transferable results and parent responsiveness, cancellation, HTTP compression round trips, HEAD/ETag/encoding negotiation, all prior slope/walking/vehicle checks and multiplayer authorization. Production build passed.

Local Brave checks covered campus generation, all three graphics options, Administration Block day/night lighting, Gyan Mandir ground entry, stair arrival on floor one and reading-room access. The local overview and Administration views reached the display's 60 fps cap. Renderer counters were lower than earlier release observations, but the earlier camera/quality settings were not controlled; no universal FPS improvement or device-independent percentage is claimed. Hosted multi-account/load rehearsals remain separate work.

Implementation references: [R3F performance guidance](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [Vite workers](https://vite.dev/guide/features.html#web-workers), [Node compression](https://nodejs.org/api/zlib.html), [HTTP encoding negotiation](https://www.rfc-editor.org/rfc/rfc9110.html#name-accept-encoding).
