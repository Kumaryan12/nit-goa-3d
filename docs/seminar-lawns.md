# Seminar Complex lawns

Two lawn polygons sit north and south of the owner-corrected Seminar Complex (`way/1423803680`). The north lawn follows the curved academic access road; the south lawn follows the entrance-side road bend. Both retain exclusions around the small utility/paved pads visible in the references.

References inspected October 5, 2026:

- [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer), north-up level 18 tiles, rows 119894–119895 and columns 184964–184966. The Seminar Complex and both lawns are in column 184965. Resolution is approximately 0.58 metres per pixel at this latitude. Retrieval date does not establish the imagery capture date.
- [NIT Goa's official campus aerial photograph](https://www.nitgoa.ac.in/static/img1.jpeg), showing the hall flanked by open grass and small planting. This cross-check prevents the regular planting pattern in the satellite view being interpreted as a dense grove of mature trees.

Contours and pad exclusions are approximate visual traces, not surveyed landscaping plans. Coordinates are stored as GPS points in `src/data/landscaping.ts`, independent of editable display names. Downloaded reference images are kept outside the application assets and are not redistributed by the site.

`src/lib/landscaping.ts` resolves the patches only when the mapped Seminar building exists. Terrain generation blends green turf into existing vertex colours with a short edge fade and road/building/plaza clearance. It leaves every ground height unchanged, so slopes, walking and bicycle/buggy wheel contact use the same surface. Existing night lighting illuminates the grass normally. The seeded large-tree generator avoids these open patches, including their utility pads, while retaining roadside trees elsewhere. Small plant species and planting positions are not reconstructed from these references.

`tests/landscaping.test.mjs` checks the real building/lawn relationship, hardscape holes, name-edit stability, unchanged terrain heights, protected paving, open exploration and tree exclusion.

## National flag opposite Administration Block

The owner confirmed a national flag on the lawn facing Administration Block. A GPS anchor on the eastern part of the south lawn places the mast across from the corrected Admin footprint. Its exact point, 18 m mast and stone pedestal are visual estimates. The pedestal spans the sampled local slope with a level top; the campus height field is not modified.

The flag uses saffron, white and green bands of equal height, a centred navy blue Ashoka Chakra with 24 spokes, and 3:2 proportions, following the design in the [Ministry of Home Affairs Flag Code](https://www.mha.gov.in/sites/default/files/FlagCode_E_31122021.pdf). A local canvas texture prints the complete flag on both sides. A GPU vertex shader gives the cloth a gentle breeze with a fixed hoist and matching normals; reduced-motion preferences pause the animation. Night mode adds subtle material fill without allocating another light or shadow map. The mast and pedestal cast shadows; the cloth does not use an undeformed shadow mesh.

The flag appears in the overview map. Walking and full-body vehicle collision protect its pedestal, and follow-camera collision protects the mast at its actual radius. Generated streetlights retain clearance. `tests/campusFlag.test.mjs` validates real-campus placement, slope attachment, obstacle clearance, renamed-building stability, walking/jumping/vehicle clearance and camera obstruction.
