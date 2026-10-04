# Real OSM regression fixture

`nit-goa-campus.json` is the unmodified JSON response fetched from `https://overpass-api.de/api/interpreter` on 2026-10-01 with `CAMPUS_QUERY` from `src/lib/osm.ts`.

It includes campus way 1259742369, 14 building ways, and 8 building multipolygon relations. The relations contain 11 inner rings. The fixture is used by tests; an identical copy in public/map is served as the verified production map snapshot. Local development requests live Overpass data.

Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).

`nit-goa-roads.json` is the unmodified response from the same endpoint on 2026-10-01 with `ROADS_QUERY` from `src/lib/osm.ts`. It contains the campus boundary and 20 `highway=service` ways, with no separately mapped footways or paths. An identical copy in public/map is also served to production visitors.
