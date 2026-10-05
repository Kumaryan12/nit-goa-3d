# Gyan Mandir exploration

The owner confirmed ground plus two upper floors, room numbering starting to the left as visitors enter from the side facing Seminar Complex, ground rooms 1–15, first-floor rooms 16–45, and second-floor rooms 46–75. A large reading room occupies the north end of the first floor. The owner also identified two courtyards.

The north-up Esri World Imagery satellite tiles covering the building show two open courts separated by a transverse wing. OSM maps one continuous, notched courtyard opening. `gyanGeometry.ts` divides that opening around an estimated 5 m wide wing centered at local Z = −158 m. The mapped outer boundary is retained; the source OSM data stays immutable. Rendering, roofs, walking, vegetation and the minimap share the corrected geometry. The wing position and dimensions are visual estimates, not surveyed measurements.

References inspected:

- [Esri World Imagery service](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer), level 18 tiles at rows 119894–119895, columns 184965–184966, downloaded October 4, 2026. North is −Z in this project. Higher-resolution tiles were unavailable. These tiles are used for reference and are not redistributed in the app.
- [Institute aerial photograph](https://www.nitgoa.ac.in/static/img1.jpeg).
- [Official admission brochure, Gyan Mandir photograph on page 13](https://www.nitgoa.ac.in/uploads/Admissionbrochure2025.pdf).

Visitors select Gyan Mandir and choose **Enter Gyan Mandir**, or use **Start near** and press E at the entrance. The current floor is shown as a cutaway. Classrooms have open doorways, numbered signs, teaching boards, tables and chairs. Two stair journeys connect the three levels. **Find reading room** on the first floor brings visitors to its doorway. The reading room has study tables, chairs and bookshelves. **Leave Gyan Mandir** returns to the outside entrance from any floor.

Classroom partitions, doorway and staircase positions, reading-room dimensions and furniture are an editable approximation. Room ranges, floor count, two courts and the reading-room side follow the owner's description. Courtyards are visible through the cutaway; walking is constrained to interior floors and corridors around them. No live teaching, reservations or assigned room functions are implied.

Shared avatars and nearby text chat use `gyan:0`, `gyan:1` and `gyan:2` spaces. Nearby chat and remote avatars stay on the visitor's current floor, separate from the hostel and outdoors. Existing Firebase authentication and owner-only editing remain in place.

Verification includes flood traversal to every numbered room, the reading-room door and both landings on every floor, tangible furniture, floor ranges, north placement, courtyard/source preservation, camera obstruction, stair transitions and strict multiplayer-space validation. Existing hostel traversal checks remain unchanged. The full 276-test suite and production build pass. Chrome guest preview verified building-card entry, the ground-floor cutaway, stair ascent to the first floor, and the reading-room doorway and furnishings. A real two-Google-account interior rehearsal remains pending.
