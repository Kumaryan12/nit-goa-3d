# Greener campus presentation

The campus ground now uses evergreen, jade and sage tones with small spatial colour variations. Stone-coloured road/building aprons transition to green over nine metres instead of the former 45-metre fade. The existing terrain heights, canal cuts, saved slopes and collision sampler are unchanged. Lawn boundaries and utility pads retain their established protection.

The same 640 trees retain their positions, trunks and collision volumes. Broadleaf trees have six crown lobes instead of four, with restrained green shade variation and occasional warm new-growth tones. Curved palms use deeper green fronds. Daylight has a softer ivory sun, green ground bounce and less yellow exposure; existing moonlight, streetlights and lit windows remain available at night.

## Breeze and grass detail

Canopies, palm tips and low grass use a standard lit material with a small GPU vertex displacement. Two slow spatial waves make nearby plants move together without moving every instance matrix on the CPU. Grass roots, palm attachments and tree trunks stay fixed. Maximum horizontal displacement is small: 12.2 cm for canopies, 16.2 cm for palms and 4.8 cm for grass along X; Z is smaller. Foliage bounds include motion clearance. Standard fog, shadows and instance colours remain in use.

`prefers-reduced-motion: reduce` stops the foliage breeze, including when the preference changes during a visit. Hidden tabs retain the existing rendering pause. Foliage does not trigger additional shadow-map refreshes or add lights; its shadows use the undeformed geometry, an intentional approximation for the small sway.

The worker generates at most 10,000 short grass tufts, grouped into 48 m chunks. The published campus produces 223 chunks with no more than 83 tufts in one chunk. Five tapered blades share a single 25-triangle geometry. Roads, building aprons, sports/theatre clearings, canal banks, flag approaches, utility pads, garden beds and shrubs have planting clearance. Grass is decorative and adds no collider. It follows the displayed terrain and allows walking, bicycles and buggies through open lawns.

| Graphics level | Chunk draw cap | Distance from chunk bounds | Maximum grass triangles for this layout |
| --- | --- | --- | --- |
| Smooth | 6 | 65 m | 12,450 |
| Auto middle | 9 | 95 m | 18,675 |
| Detailed / Auto high | 12 | 125 m | 24,900 |

Chunk selection updates four times per second, uses camera height as well as horizontal distance, and retains normal frustum culling. Wide aerial views omit the small blades while keeping green terrain and trees. Placement checks run in the existing campus worker; browsers unable to create a worker use the established main-thread fallback. GPU allocation and instance upload still happen on the main thread. The planting is illustrative rather than a surveyed species inventory.

## Validation

The development-only `/tests/fixtures/foliage-preview.html` exercises the actual tree and flag materials, production lighting, cached shadows and Day → Night → Day transitions with a fixed camera. It measures framebuffer coverage independently for trunks, broadleaf cores/lobes, palm fronds and flag cloth, and reports shader compilation failures. Chrome Guest produced nonzero coverage for every group in all three phases, with zero shader errors. This fixture is excluded from the production build.

That investigation exposed a separate flag shader defect: its wind function and Three's leading `#define` were concatenated onto one line. A newline now preserves the directive boundary, restoring the tricolour and removing its GPU compilation errors. Full-campus checks after a fresh reload showed palm and broadleaf foliage in Day and Night, and foliage remained visible after returning to Day. These observations do not establish that the flag error caused the reported intermittent tree disappearance or cover every browser/device.

391 tests and the production build pass. New tests cover deterministic, bounded planting across all campus quadrants, terrain attachment, route/plaza/canal/flag clearance, finite quality budgets, distant/aerial omission, blade geometry and preservation of the standard shader's instancing/lighting path. The real worker test checks meadow transfer while the parent remains responsive. Existing terrain, interiors, collisions, vehicles, multiplayer and authorization tests continue to pass.

Chrome Guest checks covered daytime overview, avatar-height foliage/grass, Administration Block lawns and nighttime street/window lighting. The preview reached the local display's 60 fps cap in the inspected scenes; this is not a mobile or crowded-campus benchmark. A separate local generation sample took approximately 235 ms for meadow placement on this development machine, in addition to the existing campus build. Full-campus device/load measurements remain separate work.
