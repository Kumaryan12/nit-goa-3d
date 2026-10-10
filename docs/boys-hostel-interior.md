# Approximate Boys Hostel interior verification

The campus owner confirmed ground + four upper floors and authorized an approximate interior. The mapped outer Talpona footprint is retained. The owner confirms two open courtyards and a badminton court in the southeast courtyard. Official NIT Goa aerial photographs guided exterior/courtyard context; the hostel facilities page provided furnishing context. These sources do not verify interior partitions, room numbers or exact stair/lift coordinates. The October 10 layout follows the owner’s relative entrance walkthrough.

## Implemented behavior

- Boys Hostel's card opens Avatar Walk directly inside, including when the avatar already has an outdoor position from an earlier session in Overview.
- The approximate ground entrance can also be reached using Start near Boys Hostel; E or the entrance button enters.
- Each floor has generated DEMO room labels, open doorways, beds, desks and cupboards. Verified metadata room arrays remain empty. The current lobby and circulation layout fits 18 sample rooms per level; this does not represent actual capacity.
- Short movement substeps and furniture/wall clearance protect the avatar. Both courtyards are accessible through ground-floor openings. Upper-floor courtyard edges and exterior edges remain protected.
- Boys Hostel walks at 2.2 m/s and runs at 3.6 m/s, with the existing gradual acceleration and quick braking. This hostel-specific pacing applies on all five floors through the shared keyboard/touch controls. Gyan Mandir keeps its existing indoor pace; guided stair travel keeps its existing timing. The hostel speeds remain within the shared multiplayer walking limit.
- Proximity-gated E/Upstairs/Downstairs actions walk the avatar along visible treads. The opening cannot be entered by ordinary movement. Pause, text entry, dialogs and hidden tabs suspend a stair journey.
- Leave hostel returns to the ground-level outdoor entrance; Start near and Reset walk return to outdoor exploration. Overview restores the exterior and roofs with two corrected courtyard openings.
- Camera clearance accounts for walls, stair treads and door lintels. Tight camera positions hide the avatar to preserve visibility. Stair arrivals face an open corridor.

## Verification

- Original interior verification: `npm test` passed 174 tests, including seven interior tests using recorded OSM campus geometry. A flood traversal verifies on-foot connectivity from the entrance to every demo room and both landings. Other checks cover safe entry/spawn, normalized movement, doors, walls/furniture, all five floors, courtyard preservation and camera clearance.
- `npm run build`: TypeScript and production build pass. Vite retains its existing large-chunk advisory.
- Chrome desktop: checked building-card entry, entrance interaction, all four upward transitions, downward traversal, E at a landing, stair pause/resume, leaving from an upper level and Overview/Walk position retention. The original 22-building exterior, 193 road segments, corrected terrain and selection remain visible in Overview.
- Chrome responsive emulation at 390 × 844: checked readable interior controls, landing/upstairs touch actions, floor arrival and daylight/night rendering. This is browser emulation, not physical-device testing.
- Console contained upstream Overpass 504/429 requests and the existing Three.js Clock deprecation advisory; no interior runtime error was observed. Existing recorded/cached map fallback remained usable during those requests.

## References and limits

- [Official Boys Hostel aerial photograph](https://nitgoa.ac.in/uploads/boys%20hostel.png)
- [Official campus aerial photograph](https://www.nitgoa.ac.in/static/img1.jpeg)
- [NIT Goa hostel facilities](https://nitgoa.ac.in/hostels/facilities.html)

The room partitions, precise entrance/stair/lift coordinates, dimensions and DEMO labels are a playable approximation. The relative entrance layout now follows the owner’s walkthrough described below. There are no surveyed interiors, bathrooms/common-room allocation, real room numbering, residents or occupancy data. Replace the generated arrangement with a verified floor plan or walkthrough when available.


## October 4, 2026 courtyard correction

North-up [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) level 18 tiles (rows 119892–119894, columns 184967–184969) were inspected alongside the official Boys Hostel aerial photograph. The imagery shows two open courtyards; the official photograph clearly shows a roof over the irregular third OSM opening. `boysHostelGeometry.ts` closes only that covered opening, preserving the outer ring and immutable OSM snapshot. Rendering, roofs, terrain, trees, minimap and interior collision use the shared correction.

The satellite resolution does not establish badminton markings or precise court placement. The owner confirms the southeast courtyard. A code-native 13.4 × 6.1 m court, approximate two-metre runoff, service/singles/doubles markings, posts and a mesh net are positioned within that courtyard, following the mapped wing orientation and building foundation elevation. Both courtyard floors are visible in Overview and the interior cutaway. This adds the court's appearance; it does not add a badminton game or new walking access through the courtyard walls. Court dimensions, colors and its exact position are approximate. Reference imagery is kept outside public app assets.

The revised plan fits 30 demonstration rooms per floor. Regression checks cover two-hole roof/floor geometry, source preservation, unrelated buildings, southeast court/runoff containment, terrain foundations and on-foot connectivity to every room and staircase. Search now matches word prefixes, preventing “admin” from incorrectly matching inside “badminton”.

Visitors can choose **View courtyards & badminton court** on the Boys Hostel card to switch to an elevated, north-up view. Chrome guest preview verified the two openings, marked southeast court and net from this view, and successful ground-floor interior entry. All 278 tests and the production build pass.

## October 10, 2026 entrance walkthrough

The owner described stairs ahead on entry, two lifts ahead beside the route to the courtyard without badminton, and two lifts to the right beside the badminton courtyard route. The four corridor branches are the early left turn, the far end of the plain-courtyard lift area, the right-hand route toward the south, and the far end of the badminton-courtyard lift area. These relative relationships guide `boysHostelLayout.ts`. A fresh north-up Esri level-18 mosaic and the official hostel aerial photograph were inspected for the two-wing exterior and entrance elbow; neither source establishes the interior partition positions.

- Move the entrance from the generated southeast end to the elbow between the mapped wings. Place the staircase ahead of the lobby and reserve clear paths around it.
- Add four solid, numbered lift enclosures in two pairs on all five floors. Walk near a lift to choose a floor in the keyboard/touch controls; floor changes are a local transition to that lift’s safe landing, with a new multiplayer relocation epoch. Animated cabin travel is not implemented in this pass.
- Add four signed corridor branches with paving accents, sage and warm stone finishes, brushed lift doors and restrained lighting. Room generation yields 18 DEMO rooms per floor after reserving the lobby, shafts and access routes; this is not the hostel’s real room count or numbering.
- Open two 2.4 m ground-floor courtyard entrances. Both courts are reachable on foot, with open-sky headroom. Courtyard perimeter walls remain solid elsewhere, upper-floor edges remain blocked, and the badminton net/posts stay solid. Surface height follows the court finish.
- Keep Gyan Mandir’s plan separate, and retain the faster 2.2/3.6 m/s hostel movement from the preceding local change.

The corridor labels, exact lift positions, openings and finishes are approximate and ready for owner review. Detailed room furnishings, bathrooms and common spaces still await the owner’s description.

Local verification: all 465 regression tests and the production build pass. Recorded-map traversal checks every room, lift landing, corridor endpoint and stair landing on ground and upper floors, plus both ground-floor courtyards. Lift arrivals on floors G–4 are safe; remote/invalid floor requests, shafts, net, walls and upper courtyard edges remain blocked. Brave desktop review confirmed lobby entry, stair travel up and down, and day/night rendering. Lift cabin animation and a two-account live rehearsal were not tested in this local pass.
