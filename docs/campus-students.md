# NPC campus students

Campus life is enabled by default. Use **Campus life** in the toolbar to switch it off/on; that preference stays on your device. Sixteen fictional students populate the outdoor campus: eight walk between real entrances, four chat in pairs near Gyan Mandir/Nescafé, and four sit at Nescafé/OAT seats or stand during a break. Nearby labels identify them as NPCs. They are separate from signed-in people and have no accounts, profile links, seat reservations or group-photo identities.

Approach an NPC on foot to receive a wave and a brief greeting. Use **Actions → Wave**, **Dance** or **Applaud** for a matching response. At most the two nearest students respond. Greetings have cooldowns and require a fresh approach; a held gesture is not replayed continuously. Conversations alternate short scripted text and gentle hand movements. They do not use AI services, microphone capture, voice relay or additional network messages.

Walking students follow collision-checked road routes with bounded detours to entrances, wait at destinations and return. They use the same walls, trunks, lamps, canal and slope clearance as walking visitors. They pause/step away from nearby real visitors and vehicles. NPCs are decorative rather than solid colliders, so they cannot block avatar movement or participate in vehicle impacts, races or football. A seated NPC yields when visitors approach, and hides during a close seat handoff to avoid overlapping an actual visitor. Shared player seats and concert reservations remain owned by the server.

## Performance and ownership

Plans are generated in `prepareDigitalTwin` using the existing worker after terrain, vegetation and interiors are ready. Missing/partial map data produces fewer students rather than unsafe placeholders. The bounded local path search checks every leg at 45 cm intervals; each detour explores at most 1,800 entries. Plans are plain structured-cloneable data and rebuild with owner campus edits.

Behaviour updates at 10 Hz, transforms/gaits interpolate at render frequency, and React changes only for occasional detail/visibility/seated transitions. The camera renders only nearby students, with a maximum of eight on Smooth/mobile and sixteen otherwise. At most one, two or three NPCs use articulated detail according to graphics quality; nearby real crowds reduce that allowance. Football, concerts and driving limit NPC detail further. NPCs cast no extra shadows, add no lights, and disappear indoors. Hidden tabs stop simulation. Reduced-motion avatar settings apply to their gestures too.

Routines and reactions are local ambience; two visitors can see different NPC timing/replies. Real players, chat, voices and shared games remain networked. NPCs never increase People counts or consume multiplayer/relay capacity.

## Review

`tests/campusStudents.test.mjs` covers actual-campus route clearance, return journeys, bounded travel after frame stalls, greetings/cooldowns, social replies, inactive/interior rejection, real-seat handoff, talking routines, cloneable worker output and rendering budgets. Local full-app review: start Vite with an empty Firebase API key and open `/tests/fixtures/campus-ui-preview.html?view=walk`. Visit Nescafé, Gyan Mandir or the OAT, wave through Actions and toggle Campus life. This fixture supplies no production identity and does not bypass sign-in on the public site.

`/tests/fixtures/students-preview.html` provides a focused local rendering rehearsal with a synthetic viewer, day/night controls, pose/approach controls and quick views of each activity. Chrome displayed the Nescafé talking pair and seated background students with their NPC labels. The 620-test NPC release regression suite and production build pass. Physical-phone performance and real-device multiplayer should still be rehearsed before public rollout.

This feature is frontend-only and adds no server endpoint or deployment credential.
