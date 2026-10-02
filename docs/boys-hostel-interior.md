# Approximate Boys Hostel interior verification

The campus owner confirmed ground + four upper floors and authorized an approximate interior. The existing OSM Talpona footprint and its three courtyards are retained. Official NIT Goa aerial photographs guided exterior/courtyard context; the hostel facilities page provided furnishing context. These sources do not verify interior partitions, room numbers, stair positions or the entrance.

## Implemented behavior

- Boys Hostel's card opens Avatar Walk directly inside, including when the avatar already has an outdoor position from an earlier session in Overview.
- The approximate ground entrance can also be reached using Start near Boys Hostel; E or the entrance button enters.
- Each floor has generated DEMO room labels, open doorways, beds, desks and cupboards. Verified metadata room arrays remain empty. The recorded footprint fits 29 sample rooms per level; this does not represent actual capacity.
- Short movement substeps and furniture/wall clearance protect the avatar. Courtyards and exterior edges stay inaccessible from the indoor floors.
- Proximity-gated E/Upstairs/Downstairs actions walk the avatar along visible treads. The opening cannot be entered by ordinary movement. Pause, text entry, dialogs and hidden tabs suspend a stair journey.
- Leave hostel returns to the ground-level outdoor entrance; Start near and Reset walk return to outdoor exploration. Overview restores the original OSM exterior and roofs.
- Camera clearance accounts for walls, stair treads and door lintels. Tight camera positions hide the avatar to preserve visibility. Stair arrivals face an open corridor.

## Verification

- `npm test`: 174 tests pass, including seven interior tests using recorded OSM campus geometry. A flood traversal verifies on-foot connectivity from the entrance to every demo room and both landings. Other checks cover safe entry/spawn, normalized movement, doors, walls/furniture, all five floors, courtyard preservation and camera clearance.
- `npm run build`: TypeScript and production build pass. Vite retains its existing large-chunk advisory.
- Chrome desktop: checked building-card entry, entrance interaction, all four upward transitions, downward traversal, E at a landing, stair pause/resume, leaving from an upper level and Overview/Walk position retention. The original 22-building exterior, 193 road segments, corrected terrain and selection remain visible in Overview.
- Chrome responsive emulation at 390 × 844: checked readable interior controls, landing/upstairs touch actions, floor arrival and daylight/night rendering. This is browser emulation, not physical-device testing.
- Console contained upstream Overpass 504/429 requests and the existing Three.js Clock deprecation advisory; no interior runtime error was observed. Existing recorded/cached map fallback remained usable during those requests.

## References and limits

- [Official Boys Hostel aerial photograph](https://nitgoa.ac.in/uploads/boys%20hostel.png)
- [Official campus aerial photograph](https://www.nitgoa.ac.in/static/img1.jpeg)
- [NIT Goa hostel facilities](https://nitgoa.ac.in/hostels/facilities.html)

The room plan, entrance, staircase, dimensions and DEMO labels are a playable approximation. This iteration has no surveyed interiors, bathrooms/common-room allocation, real room numbering, residents or occupancy data. Replace the generated arrangement with a verified floor plan or walkthrough when available. Other buildings retain outdoor-only collision behavior.
