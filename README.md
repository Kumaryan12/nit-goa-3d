# NITG Explored

A campus community with verified email sign-in, optional private/public profiles, live football and OAT concerts. A responsive welcome page introduces the experience; people can enter first and build their profile later. Crowd admission, waiting queues and MFA-protected moderation run on the live server. See [DEPLOYMENT.md](DEPLOYMENT.md) for backend setup, deployment and operating limits.

The 3D campus explorer uses Vite, React, TypeScript, Three.js, React Three Fiber and Drei. Phase 7 adds visible walking routes, traversal previews, directions, shareable URLs, an illustrative gallery, and resilient map loading. The app has two versions: the existing Overview explorer and a third-person Walk with avatar mode. Existing OSM footprints, roofs, terrain, boundary, 640 instanced trees, search, selection, day/night lighting and minimap remain intact.

## Run and verify

Use Node.js 22.12+ or a supported newer version. Firebase is required for campus entry and live rooms. Without it, `npm run dev` offers a labelled local preview from `/campus`; production access stays closed.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
```

Tests use Node's TypeScript stripping and recorded genuine OSM responses. PostgreSQL security tests use development-only PGlite; neither PGlite nor test map fixtures are included in the application. See [Phase 7 verification](docs/phase7-verification.md) for results, changed files and QA limitations.

## Meet people around campus

Signed-in visitors automatically join the shared campus while the map is open. Switch to **Walk with avatar** to appear in the world and see other walkers nearby. Their display names and profile colours accompany the same articulated character. Indoors, walkers see others on their hostel floor; Overview shows outdoor visitors. **People & chat** opens the live roster and conversation. A name links to a profile only when its owner has published a valid public handle. Emails, private bios and account roles are not part of presence snapshots. Profile changes refresh with the next access check, within 30 seconds.

**Everyone on campus** sends text to all admitted visitors; **Nearby** sends only to visitors within 35 metres on the same floor with recent visible positions. Nearby messages also appear briefly above the sender. Nearby chat needs Walk mode, has no replay history, and does not cross floors. **Mute** hides that visitor's messages and speech bubbles for this browser visit. Closing the panel keeps the live session connected; **Rejoin live campus** retries a disconnected session. Typing in chat stops avatar input.

The `/presence` WebSocket room accepts 32 verified visitors and queues up to 100 more; each Google account gets one connection. Poses are broadcast at 10 Hz and interpolated on each client. The server bounds coordinates, floor labels, movement rates and relocations against the published campus boundary. Existing client wall/terrain collision remains responsible for detailed navigation; this presence room is not an authoritative collision simulation. Hidden/disconnected walkers stop animating, and stale avatars disappear. Avatar relocation follows the existing Start near/hostel controls. Football actors already rendered by the pitch and concert actors already rendered by the theatre are excluded from duplicate campus rendering.

Chat uses plain text, a 280-character limit, one-second spacing and at most five accepted messages per ten seconds per account, with bounded WebSocket payloads and backpressure. Only admitted accounts receive presence, chat or history. The last 50 global messages from the previous 15 minutes are held in memory, cleared when the campus empties, and lost on server restart. Nearby messages are delivered live only. The owner's authenticated crowd desk includes campus occupancy and can remove or suspend visitors; a verified, audited kick/ban also removes their recent chat. The initial free-host release still needs a rehearsal with independent Google accounts before a public gathering.

Implementation: `lib/campusProtocol.ts`, `hooks/useCampusSession.ts`, `CampusPeopleScene.tsx`, `CampusSocial.tsx`, `server/campusRoom.ts` and `server/campusServer.ts`. `tests/campusPresence.test.mjs` checks public/private identity metadata, position validation, nearby delivery, shared movement/chat, anonymous and duplicate rejection, capacity/queue promotion and audited moderation.

## Shared football on Sports Ground

Click **⚽ Play football** in the toolbar or **Join live football** in Sports Ground's details. Members with a verified email can join. A full pitch uses a waiting queue; profiles are optional. The avatar starts on the existing pitch; move with WASD or the touch thumbstick, turn with arrows/drag, and kick with **Space** or the **Kick** button. **Shift + Space** (or Run + Kick on touch) shoots harder. Walking into the ball dribbles. Blue attacks the blue goal; Gold attacks gold. Goals update the shared score and return the ball to the center after 2.5 seconds; out-of-play balls restart after 1.5 seconds. **Return ball to center** retains the score; **Leave** returns to normal campus walking.

A Node WebSocket server verifies each account and owns one ball and score for up to 24 simultaneous players, with up to 100 waiting. One account can occupy one pitch place. The client sends bounded player poses and kick requests; the server checks reach, movement speed and input, simulates friction/posts/goal crossings, and broadcasts at 20 Hz. Other visitors appear in team jerseys. Pausing, opening dialogs, editing text, hiding the tab or leaving stops your player's input; other visitors continue playing. Closing a tab removes its player, and stale connections are cleaned up by heartbeats. The score is in memory and resets when the server restarts.

`npm run dev` and `npm run preview` include the game server automatically. For a production build, use **`npm run build` then `npm start`** with Node 24+; this serves both `dist` and `/football` on port 4173 by default (`PORT` and `HOST` are configurable). To serve a LAN or container, set `HOST=0.0.0.0`. A public deployment needs a Node host with WebSocket upgrades; putting `dist` alone on a static host does not provide multiplayer. Serve the app, protected APIs and both WebSocket paths on the same HTTPS origin; the included production server and Dockerfile handle them together. Development and production use [ws](https://github.com/websockets/ws) with the browser's native WebSocket client.

Implementation: `lib/football.ts`, `lib/footballProtocol.ts`, `hooks/useFootballSession.ts`, `components/FootballScene.tsx`, `FootballControls.tsx`, and `server/`. `tests/football.test.mjs` checks rotation, kick reach, scoring, posts/out-of-play, invalid input, and two actual WebSocket clients sharing a goal and disconnecting.

## Two explorer versions

Use the **Overview / Walk with avatar** switch in the header. Both versions share the same real OSM buildings, roads, corrected names/positions, Nescafe-to-sports slope, lighting and gallery.

- **Overview** keeps the existing orbit camera, search, building selection, routes, route previews and campus editor.
- **Walk with avatar** follows an animated student at ground level. Hold **WASD** to walk/strafe, **Up/Down** to walk, **Left/Right** to turn, and **Shift** to run. Drag the scene to look around; scroll to adjust follow distance. On touch devices, drag the thumbstick to move; drag farther for more speed. Look buttons turn the camera, and Run toggles running. Direction buttons remain keyboard and screen-reader accessible. **E** or the nearby-place button opens place details.
- **Start near** moves the avatar to a safe outdoor position near a selected landmark; **Reset walk** returns to Main Entrance. **Pause/Resume** stops/restarts controls. Search and building selection show information without moving the avatar; **Start walking here** in a place card starts nearby in Walk mode.

Open `/campus?view=walk` directly to start in Walk mode. The `view` parameter preserves night mode, selected places and deployment paths; browser Back/Forward restores the version. The avatar position is retained when switching versions within the session, but is not saved after reloading.

Outdoor walking treats building footprints and campus edges as solid, with clearance for the avatar and preserved courtyard holes. Boys Hostel and Gyan Mandir offer explorable interiors with open room doorways and interactive stairs; interior partitions and furnishings are approximate. Gyan Mandir uses the owner-confirmed room ranges 1–15 / 16–45 / 46–75 across ground plus two upper floors, two courtyard openings, and a large first-floor reading room at the north end. Movement follows the displayed terrain, rejects cliffs, and uses short swept steps to prevent wall tunneling. The follow camera shortens near buildings, interior walls, stairs and rising ground. Gallery/auth/upload dialogs, text entry, lost focus and hidden tabs stop movement, including stair journeys. Walk mode waits for a usable campus boundary; existing map loading/error/retry handling remains available. Pedestrian accessibility has not been surveyed.

Implementation: `components/AvatarExplorer.tsx`, `StudentAvatar.tsx`, `WalkControls.tsx` and `lib/walking.ts`. The rounded student model has articulated knees/elbows, detailed sneakers, facial features and a backpack. Fixed details are merged by material. Acceleration and braking use an integrated exponential response, normalized analog input, distance-based strides, a grounded supporting foot, a distinct run posture and a football kick animation. Remote football players use the same character and distance-based gait. Pause, text focus, hidden tabs and lost focus clear momentum immediately. `lib/avatarMotion.ts` and `tests/avatarMotion.test.mjs` cover frame-rate consistency, braking, analog input and planted-foot poses. Animation uses frame callbacks and refs; nearby-place React updates are throttled to five per second. `tests/walking.test.mjs` checks collisions, courtyard clearance, normalized motion, stalled frames, safe spawns on recorded OSM geometry, terrain following, camera obstruction and mode URLs.

## Architecture

`App.tsx` coordinates selection, URL state, independently loaded buildings/roads, navigation and optional dialogs. `CampusScene.tsx` owns the Fiber Canvas. Geometry and domain utilities live in `src/lib`; editable campus anchors and height overrides live in `src/data`; interfaces live in `src/types`. `useDigitalTwin` asynchronously loads and memoizes terrain, vegetation and metadata derivation. Existing architecture is preserved; there is no mapping-framework replacement or React Router.

| System | Main files |
| --- | --- |
| OSM coordinates and parsing | `lib/osm.ts`, `geo.ts`, `buildings.ts`, `roads.ts` |
| 3D campus | `components/CampusScene.tsx`, `OSMBuildings.tsx`, `OSMRoads.tsx`, `Terrain.tsx`, `CampusBoundary.tsx`, `Vegetation.tsx` |
| Metadata/search/selection | `data/campus.ts`, `data/buildingOverrides.ts`, `lib/campus.ts`, `SearchBar.tsx`, `BuildingInfoPanel.tsx` |
| Navigation | `lib/pathfinding.ts`, `directions.ts`, `traversal.ts`, `camera.ts`, `RouteOverlay.tsx`, `RouteTraveler.tsx`, `DirectionsPanel.tsx`, `NavigationMode.tsx` |
| Community gallery | `types/gallery.ts`, `repositories/`, `GalleryPreview.tsx`, `GalleryModal.tsx`, `PhotoViewer.tsx`, `PhotoUploadDialog.tsx` |
| Backend/auth | `lib/firebase.ts`, `hooks/useAuth.ts`, `server/access.ts`, `server/profileStore.ts`, `firestore.rules` |
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
/campus?location=boys-hostel
/campus?from=main-entrance&to=boys-hostel&mode=night
/campus?photo=academic-evening-demo
```

Query helpers validate IDs, preserve unrelated query parameters and deployment paths, and update history without reloads. Back/Forward restores meaningful selection, route, night and photo state. Unknown IDs fail gracefully. Photos reload directly by repository ID; closing removes `photo`. Modal openness, playback progress and other transient UI are omitted from URLs.

## Boys Hostel building details

Boys Hostel (Talpona) has a ground floor and four upper floors (five levels total), confirmed by the campus owner. `src/data/buildingDetails.ts` stores each floor and its verified room directory; `src/types/buildingDetails.ts` defines floor/room records for further buildings. Verified room arrays remain empty until actual numbering is supplied. Its info panel includes a floor selector and lists provisional **DEMO** room labels from the generated interior separately from verified records.

The exterior fallback height is 16 m (five estimated 3.2 m levels); valid OSM height/level tags still take priority. The mapped outer footprint is retained. The satellite/aerial-informed correction shows two open courtyards and closes a covered area that OSM recorded as a third hole. A marked badminton court with posts and a net occupies the southeast courtyard, as confirmed by the owner. Walk mode provides a ground-floor doorway; entering switches to a cutaway of the current floor so the exterior and roof do not obscure exploration.

- Select **Boys Hostel → Enter approximate interior** to start inside. Alternatively use **Walk with avatar → Start near Boys Hostel → Go**, then **E** or the entrance button.
- Walk through open room doorways with WASD or the touch controls. Rooms include beds, desks and cupboards with collision clearance. Labels such as **DEMO G-01** and **DEMO 4-01** are invented identifiers, not real room numbers.
- Walk to a stair landing (or use **Jump to stair landing**), then **E / Upstairs / Downstairs**. The avatar walks the visible steps between levels; ordinary movement cannot accidentally fall through a stair opening. **Leave hostel** returns outside at ground level from any floor.
- Switching to Overview and back retains the interior floor/position within the session. Switching during a stair journey returns to a safe landing on the same floor. **Start near** and **Reset walk** return to outdoor exploration.

`src/lib/hostelInterior.ts` generates rooms and stairs inside the mapped building polygon, tests full rectangles against courtyard holes, and handles movement/camera clearance. The recorded footprint currently fits 30 demonstration rooms per floor. This is a playable sample, not a claim about the hostel's actual room count, entrance, staircase or partition positions. `src/components/BuildingInterior.tsx` renders instanced walls/furniture, floor slabs, steps and local canvas room plaques; it adds no remote assets or gallery photos.

Exterior/courtyard references: [official Boys Hostel aerial photograph](https://nitgoa.ac.in/uploads/boys%20hostel.png), [official campus aerial photograph](https://www.nitgoa.ac.in/static/img1.jpeg), and [NIT Goa hostel facilities](https://nitgoa.ac.in/hostels/facilities.html) for furnishing context. Aerial images do not establish an indoor floor plan. Room layout, interior dimensions and stair/entrance placements remain approximate and can be replaced when a floor plan or walkthrough becomes available. `tests/hostelInterior.test.mjs` verifies footprint preservation, room/landing connectivity, passable doors, furniture/wall collision, all five levels and indoor camera clearance.

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

Open **Terrain** to adjust the relative rises for Nescafe above Sports Ground (8 m), Administration above Main Gate (6 m), and Faculty Quarters above Girls Hostel (4 m). These are editable estimates. **Apply terrain** saves them in this browser independently of name/location corrections; **Reset defaults** stages the original estimates until applied. **View Nescafe–Sports slope** applies the settings and frames both terraces in Overview for inspection. Enable **Show height contours** to trace the displayed surface at 2 m intervals.

The campus owner clarified that the slopes are visible in the roads, with no exposed brown earth. The terrain retains its ordinary ground/grass colors and models the described relative grades without additional raised mounds. Saved settings from the earlier hillside version discard the removed hillside value while retaining slope heights. Roads approaching lower building terraces blend over 16 m to avoid an abrupt step. Trees follow the surface and avoid steep slopes. The default road geometry is checked against the avatar's walking slope limit; larger custom rises can make terrain steeper.

Main Gate to Administration has **two rises separated by a level section**, with a total estimated rise of 6 m. The road from Girls Hostel toward Faculty Quarters climbs continuously, joining level building terraces; its estimated total rise is 4 m. The stage positions, widths and heights remain approximate pending on-site details.

The owner’s exported **admin to upwards** section is included in `src/data/topography.ts`: lower X/Z −383.23/−106.08, higher −319.58/−106.24, 4 m rise, 40 m blend width. It loads for new visitors. Older browser saves inherit this published slope once while retaining local edits; subsequent edits or removals remain saved locally.

Use **Terrain → Map campus slopes** to name another slope, pick its lower and higher ends on the 3D map, and set an estimated rise and blending width. Endpoint markers preview the section; **Save slope** updates roads, foundations, vegetation and avatar ground height. Edit or remove saved slopes in the same panel. Slopes are stored in this browser; **Export terrain** downloads `campus-terrain.json` for sharing. **Reset defaults** restores published slopes and clears additional browser-only slopes when applied.

To identify another slope, provide a campus-map screenshot with arrows pointing uphill, or name the lower and upper landmarks and describe where the slope starts and ends. A gentle/moderate/steep estimate is enough to draft it; exact relative heights or photos of the road can refine it later. Additional slopes should follow owner-provided locations rather than inferred hills around every clearing.

## Open Air Theatre

The owner's screenshots place the theatre in the **large planted plaza between Gyan Mandir and Academic Block, inside the L-shaped road near ECE/CSE**. Choose **Open Air Theatre** in Explore Campus, search for **OAT**, click its 3D model, or select it on the minimap. The illustrative model fills a roughly 69 × 39 m plaza with six semicircular seating tiers, a raised stage with a shallow ramp, central and rear steps, a roadside path and evening lights. Its plaza shares Academic Block's terrain bench, and generated trees leave the theatre and approach clear.

The theatre faces 90° counterclockwise from its initial placement, with seating proportions fitted to keep the same plaza clear of nearby buildings. In Walk mode, **Start walking here** places the avatar at the roadside entrance facing the theatre. The steps and ramp support walking; benches block passage. **Edit name / location** lets the owner refine the position and rotation and export those corrections. The footprint, seating and stage dimensions are estimates pending a photograph or measured layout; no theatre photograph is fabricated in the gallery.

### Live concerts

Choose **OAT concerts** in the toolbar or **Open live concert** in the theatre panel. Enter a stage name to join the shared concert, then **Take the stage** to perform. The current performer can name the concert, play the included original backing track, share an audio file (up to 12 MB), or load a direct HTTPS audio URL. Play, pause and restart are shared; late arrivals join at the current playback position. Listener volume and mute affect only their own sound. YouTube/Spotify page links are not direct audio sources.

**Start live microphone** explicitly requests microphone access and sends the performer's audio to the audience over WebRTC. Backing music is mixed with the microphone into the same stream, so listeners hear music and singing together; local music resumes when the microphone stops. External audio links must permit cross-origin audio access; upload a file or use the included backing track if a link cannot play. The microphone starts off, and stops on leaving, disconnecting or ending a stage turn. Voice is not recorded. Use headphones to keep the backing track out of the microphone. Performers join a FIFO queue; the next person gets the stage when the current turn ends. Stage speakers, a microphone, the performer and seated audience appear in the 3D theatre. Copy the invitation link to bring others into the same concert.

The `/oat` WebSocket room supports 24 connected visitors and runs alongside football under `npm run dev`, `npm run preview`, or `npm start` after a build. One concert is active per server process; state and shared audio files are temporary and reset when the room empties or the server restarts. Recent unplayed uploads expire after 30 minutes, with at most four files retained. Audio uploads require the current performer's connection token and the accepted website origin; media requests support byte ranges.

For deployment, route `/oat` WebSocket upgrades and `/oat/audio` HTTP requests to the same Node process. Use HTTPS for microphone access. `OAT_ORIGIN` restricts the accepted browser origin; `VITE_OAT_URL` can point to a separate concert server. Configure `VITE_OAT_ICE_SERVERS` with your STUN/TURN service (use short-lived TURN credentials) to support visitors behind restrictive networks. The default STUN server allows direct connections but does not provide a relay. The current design sends a separate voice stream from the performer to each listener; larger concerts need an SFU and authenticated event administration.

## Entrance canal and bridge

The owner confirmed a small canal crossing **just inside Main Entrance**. `src/data/waterways.ts` holds its approximate course and dimensions: a 3 m water channel, 1.2 m depth, and a 7 m bridge span roughly 36 m inside the corrected gate. The crossing aligns with both mapped entrance carriageways and appears only once those roads are available. The course, length, lining, railings and water-flow direction remain illustrative pending a marked map or photograph.

The terrain mesh has an actual opening at the channel, with recessed teal water, restrained flowing ripples and grey concrete lining. A structural deck, abutments and outer railings support the existing road surfaces. The bridge follows the road grade, keeping avatars and route previews on the same surface. Walking blocks the channel and outer railings; tree placement keeps the banks clear. The canal is also shown on the minimap. Reduced motion keeps the ripples stationary. Select **Main Entrance** to inspect the crossing. `tests/canal.test.mjs` checks placement, exact terrain cuts, recessed water, deck elevations, pedestrian crossing and route connectivity.

## Gallery and demo mode

The UI uses `GalleryRepository`, not SDK calls for data operations. `GalleryPhoto` includes location, storage path, original/thumbnail URLs, author, timestamps, dimensions, pending/approved/rejected status and likes. Repository methods provide latest/popular/location queries, lookup, upload, owner deletion, likes/unlikes and reporting.

The current release uses an explicitly labelled demo gallery with eight illustrations. Uploads, likes and reports are disabled until a Firebase photo-storage pipeline is connected. Image preparation and previews remain available, without pretending to persist submissions. The previous Supabase gallery adapter and SQL migrations are retained as legacy code; the app does not select that adapter or use Supabase for sign-in.

## Administration Block appearance

Administration Block has a dedicated facade inspired by the institute's [public campus photograph](https://nitgoa.ac.in/static/slideshow1.jpg): cream walls, white-framed windows, a pillared red-tiled entrance, a curved central pediment, and blue English/Hindi institute lettering. The facade follows the owner's corrected building assignment and faces Main Entrance; selecting the block shows that public face. Its mapped footprint, height and terrain elevation remain authoritative. This is a visual approximation, not a surveyed architectural model. Courtyard/irregular footprints retain their original roof openings if the owner reassigns the block. Window details are instanced, and sign textures are generated locally without an external font request.

Ten additional buildings have photo-informed facades based on the official 2025-26 admission brochure: the ECE/CSE, CV Raman and Visvesvaraya blocks, Gyan Mandir, both hostels, Seminar Complex, Medical Centre and Canara Bank. Their owner-corrected IDs and names are preserved. Roofs follow mapped courtyard polygons, canopies leave roads clear, and Talpona's decoration aligns with its usable entrance. These are stylized estimates; reference pages, inferred matches and buildings still needing photos are recorded in [building-references.md](docs/building-references.md).

## Firebase authentication, profiles and moderation

Google sign-in is available on the landing page. Firebase ID tokens are verified on the Node server with expiry and revocation checks. A verified Google account creates an ordinary campus membership and a private profile. Profiles can be completed later, with a unique handle, bio, course, interests and avatar colour. Publishing is opt-in. Public profile copies contain only allowed display fields; private emails and membership roles are excluded.

The browser cannot read or write Firestore directly: `firestore.rules` denies all direct client access. The authenticated `/api/me` API validates profile fields and unique handles in a transaction. `/api/people` exposes only published copies with cursor pagination. Protected memberships, authenticator secrets and moderation logs stay behind the server.

The two entrances are `/student` and `/admin`. All verified visitors can use the student dashboard, shared campus and profiles. Admin access requires the exact Google UID and verified email pinned in the private server policy; other membership roles and token claims cannot grant it. The owner can open the editing studio at `/admin/campus` and crowd desk at `/admin/crowd`. Student campus views expose no editing tools.

Live football and OAT admission authenticates before sharing room state, caps each room at 24 participants, queues up to 100 visitors in arrival order and rejects duplicate accounts in the same room. The owner can remove visitors, suspend campus access, restore access and end a stage turn. Actions recheck pinned ownership and active membership and write an audit record before changing live state. Suspensions also remove the public profile copy.

Moderator actions require recent Google reauthentication and an app authenticator code. Secrets are encrypted with a runtime-only key; repeated failures lock verification, reused codes are rejected, and moderation tickets expire after ten minutes. This protects campus actions; it does not replace Google account security or Firebase's managed MFA.

Use `.env.example` for public Firebase web settings and private server credentials. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for Render setup, runtime permissions, owner authorization and launch verification.

## Map cache, retries and offline behavior

`osmCache.ts` stores the last successful processed building and road payloads separately in localStorage, with schema version and timestamp. Geometry/metadata validation rejects malformed or oversized cache entries; invalid versions/future timestamps are rejected and quota/disabled-storage failures do not crash the map. Freshness is 24 hours. Older data can still be offered during failure and is labelled stale.

Live Overpass is preferred while online. Shared requests retry network failures, 429 and 5xx with bounded exponential backoff/jitter; ordinary 4xx are not retried. Defaults permit three attempts per query, 15-second attempt timeouts and a 45-second total query deadline. Fallback queries have their own bounded request budget. Lifecycle aborts stop requests/backoff and do not silently restore caches. `VITE_OVERPASS_ENDPOINT` selects one public or self-hosted endpoint; the app does not fan out across public servers.

Failed live requests restore a valid cache with **“Using cached map data”**, age and staleness. Browser offline events use cached maps immediately; no-cache offline state gives a useful error and Retry action. Buildings and roads remain independent. Configured gallery content has a session memory cache; demo remains available offline. Gallery image availability still depends on browser caching and signed URL expiry. This is not a fully offline PWA: a first offline visit cannot fetch application bundles, and no service worker is installed.

## Accessibility and mobile

Native modal dialogs provide top-layer focus containment, background inertness, Escape and opener focus restoration. Buttons have accessible names, image alternatives identify demo illustrations, forms have labels/names, and gallery/auth loading uses restrained skeletons. Search supports keyboard selection; the photo viewer supports arrows and Escape. The canvas has a useful accessible surrounding description, search and minimap selection; individual 3D geometry is not a fully screen-reader navigable map.

Day/night colors remain readable. Reduced-motion CSS removes UI transitions; walking preview never auto-starts. Mobile information and navigation panels scroll and collapse above the minimap/statistics, leaving the map usable. Browser emulation checked 390 × 844, 360 × 800 and 430 × 932; this is not a physical-device compatibility certification.

## Performance

The landing page and Firebase sign-in load before the 3D explorer. The campus scene and optional dialogs load as separate chunks. The scene still exceeds Vite's 500 kB chunk advisory; the production build succeeds. DPR is capped at 1.5, trees stay instanced and geometry is memoized/disposed. Performance depends on the device, power settings and OSM coverage. Earlier renderer measurements describe prior builds and are not a benchmark of the authenticated release.

## Production deployment

`render.yaml` prepares a single Docker web service on Render in Singapore. The website and live rooms share one HTTPS origin and one instance. Firebase supplies Google sign-in and persistent profiles. The initial free Render plan is for testing: it can sleep and resets in-memory game/concert state when the service restarts. Select an always-on plan before scheduling public concerts. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for deployment and outstanding account steps. A static-only `dist` upload cannot serve live rooms.
