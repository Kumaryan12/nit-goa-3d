# Campus gardens and trees

The campus has low flower beds beside buildings, at the Main Entrance and sports/theatre plaza edges, along roads, and around the Seminar Complex lawns. Warm orange/yellow flowers mark entrance and administration areas; pinks and creams soften the hostels and lawn borders; lavender and cream beds surround academic buildings. Existing tree positions now render as layered shade/flowering crowns or curved palm fronds, with low green/olive shrubs beneath selected trees.

This is an illustrative landscape design. Plant species, flower colours and bed positions are not surveyed campus planting. The separately referenced Seminar lawn polygons, their utility pads and the owner-confirmed flag remain authoritative features; see [seminar-lawns.md](seminar-lawns.md).

`src/lib/campusGardens.ts` uses the resolved map, corrected buildings, owner-edited locations and terrain. Deterministic beds leave building aprons, road/path shoulders, the entrance canal, flag approach, streetlight poles, sports pitch, OAT and its approach clear. Lawn planting stays at the edges, with open centres and utility pads. Steep grades are avoided. Roots and merged soil beds follow the existing ground; no new terrain heights, raised walls or solid colliders are introduced. Existing walking, jumping, cycling and buggy rules remain in effect. Gardens wait for building and road loading alongside the trees, and rebuild from saved campus edits.

On the published map the layout generates **128 beds, 3,328 flowers and 733 shrubs**. Maximum budgets are 128 beds, 4,000 flowers and 750 shrubs. Every bed is populated before the flower budget is exhausted, and roadside candidates are interleaved across roads for campus coverage.

`CampusGardens.tsx` uses one merged soil mesh plus five instanced plant meshes: stems, petals, centres, leaves and shrubs. There are six added garden draw calls, shared memoized/disposed geometry, no per-flower React nodes, per-frame animation, new shadow casters or lights. Existing 640 trees use four instanced meshes; decorative crown lobes stay inside the existing tree collision volume. Night mode uses the existing campus illumination. Device performance still depends on the full scene and hardware.

`tests/campusGardens.test.mjs` checks deterministic generation, filled beds, landmark coverage and budgets; every root's terrain attachment and protected feature clearance; unchanged height/colour fields, tree/lamp positions and delayed loading; and finite, noncollapsed flower/frond faces with terrain-draped, upward-facing soil geometry.
