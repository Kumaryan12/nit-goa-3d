# Real OSM regression fixture

Camera input review: `/tests/fixtures/campus-ui-preview.html?controls-check` displays the actual camera target, angles and distance. The two test buttons send a drag over successive animation frames through the rendered canvas. Rotate is selected by default: left- and right-drag change the angle while target and distance stay fixed. Choose Move in the Controls guide: left-drag changes the target while angles and distance stay fixed, and right-drag still rotates. This instrumentation is development-only and requires the same empty Firebase API key as the local campus UI preview.

Loading handoff regression: `/tests/fixtures/mobile-preview.html` reports AK screen mounts and arrival/departure animation starts. A complete load should show one of each and `Intro: finished`. Add `?bundle-delay=2500` to hold the lazy campus import longer than the arrival animation and exercise the slow-download handoff. The same loading boundary owns the intro before and after the import; App reports map/scenery/render readiness to it without remounting the logo. The first arrival timestamp also carries across the handoff, so a cached scene does not restart the minimum intro duration.

Local buggy review: open `/tests/fixtures/buggy-impact-preview.html` with Vite. Replay a rear or glancing collision at gentle or high speed. This development-only fixture uses the production vehicle model, contact solver and recoil integrator; authenticated delivery, passengers and delayed packets are exercised by the multiplayer regression tests.

Local loading-screen review: start Vite and open `/tests/fixtures/loading-preview.html` (add `?mobile=1` for a 390px phone layout or `?phase=error` for retry controls). Use Preview reveal and Replay intro to review the gold logo’s foreground arrival and retreat. This development-only preview holds the selected visual stage without simulating authentication or changing real loading timing. `/tests/fixtures/campus-ui-preview.html?view=walk` verifies the actual intro-to-campus handoff with the published map snapshot when started with `VITE_FIREBASE_API_KEY=''`. Production entry uses the same intro while map, terrain, vegetation and the first rendered frames prepare; failed requests keep their retry actions, and exploration stays paused until reveal. A fast cached load lets the 1.15-second arrival finish before the one-second retreat; reduced-motion users get a short fade.

`nit-goa-campus.json` is the unmodified JSON response fetched from `https://overpass-api.de/api/interpreter` on 2026-10-01 with `CAMPUS_QUERY` from `src/lib/osm.ts`.

It includes campus way 1259742369, 14 building ways, and 8 building multipolygon relations. The relations contain 11 inner rings. The fixture is used by tests; an identical copy in public/map is served as the verified production map snapshot. Local development requests live Overpass data.

Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).

`nit-goa-roads.json` is the unmodified response from the same endpoint on 2026-10-01 with `ROADS_QUERY` from `src/lib/osm.ts`. It contains the campus boundary and 20 `highway=service` ways, with no separately mapped footways or paths. An identical copy in public/map is also served to production visitors.
