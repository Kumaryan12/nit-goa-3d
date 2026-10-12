# Nescafé terrace

The owner-confirmed Nescafé building (`way/1423803659`) now has a single-storey café pavilion appearance, red frontage signage, framed glazing and a serving window on its shaded terrace. The 4.2 m height and furnishings are visual estimates, not a surveyed reconstruction; the mapped dimensions are retained, with an owner-requested 90° anticlockwise rotation about the building centre. Foundations, service windows, furniture colliders and seat heights follow that orientation.

The road lies immediately beside the front façade. The original sports-ground-facing terrace now faces west after rotating the whole café, with four round tables, 16 green-and-cream chairs, timber pergola slats, canvas shade ribbons, potted planting, coffee cups and warm festoon lights. A clear central aisle and perimeter routes leave every chair approachable. Trees, garden beds and meadow generation reserve the terrace. Paving follows the existing terrain instead of flattening or changing it.

In avatar mode, stand beside a chair and choose **Actions → Sit**. The authenticated campus server checks proximity and height, assigns the published seat position, prevents double booking and broadcasts the same seated avatar to other visitors. **Stand up** or movement restores the previous standing position. Disconnects and existing activity timeouts release seats. Café chair poses keep shoes grounded and place hips just above the 44 cm seat; the existing OAT poses and audience reservation remain unchanged.

The social-seat build now publishes 24 rear OAT bench seats plus 16 café chairs. Deploy both the backend build and frontend when publishing this change; an older live server will not recognize café seats. Restart a local Vite server after building so it reloads the generated seat catalogue.

Furniture, pergola, planting and frontage are baked into one vertex-coloured solid mesh. Glazing, bulbs and terrain-draped paving add three static meshes; signs use local canvas textures. Night mode changes material illumination without extra shadow-casting lights, animation loops or downloaded assets.

Local rehearsal: `http://127.0.0.1:5176/tests/fixtures/cafe-preview.html` after `npm run dev -- --host 127.0.0.1 --port 5176`. Day/evening, walking, sitting and standing use the real scene components and existing development-only local social preview. It never joins production rooms. The fixture is excluded from production builds.

Automated checks cover road/boundary clearance, unchanged building rings, the walkable central aisle and all 16 chair approaches, solid furniture, terrain attachment, grounded chair poses, bounded merged geometry, and two authenticated WebSocket peers observing seat exclusivity and standing restoration.

Already-open older browsers receive a compatible roster so café seat IDs cannot make other players disappear. Updated browsers advertise café-chair support and receive the full sitting state; privacy filtering still applies to both formats.

Validation: 545 regression tests and the Cloudflare Pages production build pass. Chrome local day/evening and sit/stand checks rendered around 60 fps on the development computer; this is not a physical-phone or distributed-network performance guarantee.

Owner clarification: this is a walk-up vending café with no explicit entrance. Serving windows and waist-height counters face both the west shaded-table side and the adjacent long south wall shown in the screenshot. North and east walls remain plain; door panes, handles and the entrance sign are removed. Selecting Nescafé places the avatar at the open central aisle beside the shared tables. The local preview shows both serving sides together.

## Coffee breaks

Walk up to either vending window in avatar mode. A compact **Nescafé** button appears near the counter; choose **Coffee**, **Cold coffee** or **Water**. The avatar carries one drink for five minutes. **Take a sip** animates the right arm without changing walking, seat position or collision physics. **Put away** removes the drink immediately. Café seats continue to work while carrying a drink, and movement remains available after using the menu. Drinks clear when joining football/concerts, entering an interior or mounting a vehicle. Reduced-motion visitors hold a still drink pose.

Drinks are virtual, free and temporary. They do not make purchases, modify profiles or affect movement speed. The existing authenticated campus socket handles orders and shared state. The server checks the accepted active outdoor pose, freshness, stationary on-foot status, counter distance and height, and outward-side clearance. It chooses timestamps, restricts drink kinds, limits requests to one per three seconds and ignores client identities, coordinates and expiry timestamps. Other visitors see the same held drink and sip time; older clients safely ignore the added metadata. The server publishes five counter positions from the same saved campus model during the build. Both frontend and backend must be deployed for live ordering.

Each detailed avatar's held drink uses one small merged mesh with no texture download, transparency, particles or additional shadow light. Nearby avatars retain their articulated drink pose; distant simplified avatars omit that detail. Pose updates stay in refs; React updates only when drink selection or sip state changes. The mobile menu uses the existing translucent popover and touch-size buttons.

Verification: all 545 tests and the production Pages build pass, including protocol validation, stale/distant/interior/vehicle/airborne ordering rejection, real movement rejection, cooldowns, seated sipping, cleanup, bounded geometry, reduced-motion poses, two authenticated WebSocket peers and the minimal Docker runtime. Chrome visual checks confirmed the three drink meshes attach to the hand, the sip raises the cup while preserving the chair pose, putting away removes the cup without standing, and standing restores the avatar while retaining its drink. The local rehearsal remained around 60 fps on the development computer. This does not replace physical-phone or distributed-network testing.
