# Campus updates

Public update log: [What’s new](https://nitg-explored.pages.dev/updates).

## Movie nights in Chapora — 15 October 2026

- Add admin-hosted screenings using supported YouTube or public HTTPS MP4/WebM/M4V links, with shared play, pause and seek controls, late-join synchronisation and automatic pause when the host disconnects.
- Seat up to 32 campus visitors in Chapora facing its physical screen, dim the interior, and offer fullscreen viewing, personal volume/mute, quiet audience chat and reactions. Leaving restores a clear aisle or honours a newly selected destination.
- Reuse the authenticated campus connection, enforce host authority and seats on the server, protect newer films from delayed controls, isolate audience chat and release local media resources on departure. Video streams directly from its source without using the voice relay.
- Add a visitor-facing What’s new entry and local multiplayer rehearsal. See [chapora-screenings.md](docs/chapora-screenings.md) for supported sources, validation and deployment notes.

## Explore the Seminar Complex — 14 October 2026

- Enter the west-opening courtyard, then explore Chapora Hall with seating on the left/north and Sal Seminar Hall without seats on the right/south, following the owner’s layout and the real mapped U-shaped footprint.
- Add sideways left/right stair flights meeting at a centre landing, a raised connecting walkway and rear-facing hall doorways, lower courtyard entrances, a sloping Chapora floor and 10 larger descending terraces in Sal. Preserve the ground passage beneath the upper landing. Stair dimensions remain an editable approximation based on the owner’s confirmed routes.
- Open the upper courtyard partitions and replace the narrow crossing with a broad shared concourse between both foyers. Remove the old doorway frames, floating wall decorations and collision/header barriers; retain guards at exposed edges.
- Add rounded tan auditorium seats, centre and side aisles, stage fronts, screens, lecterns, speakers, acoustic timber, courtyard planters and warm ceiling lighting. Use official brochure photos and satellite imagery as references; furniture dimensions and seat count remain illustrative.
- Add entrance controls, gateway entry/exit and compact courtyard/hall shortcuts. Keep the hall interiors clear in the phone view and include the experience in What’s new.
- Keep geometry instanced, build the walk plan in the existing worker and accept a separate `seminar:0` multiplayer space. Protect walls, furniture, ceilings and door headers with indoor movement and camera checks.

Validation: build and all 567 regression tests pass, including real-footprint reachability for all four courtyard entrances, both rear-facing hall doorways and seating aisles, sideways-flight orientation, ascent/descent of both entrance flights, Sal’s level treads at low frame rates and both landing layers, safe arrivals, collision/camera sweeps, open-sky courtyard jumps, invalid-floor rejection and multiplayer nearby chat. Chrome previews checked the courtyard and both halls in day/night views plus compact controls at 360 pixels. Correct an unrelated café socket test to await its own error response instead of assuming delivery order across clients. See [seminar-interior.md](docs/seminar-interior.md) for sources and approximation boundaries.

## People finder removed — 13 October 2026

- Remove the people/location finder card, remote-person map markers, direction arrows, distances and Find controls from desktop and phone views. Remove its What’s new entry.
- Remove finder preference controls and polling. Updated clients disable locator visibility when joining or reconnecting, while existing nearby-avatar privacy filtering continues to support older clients.
- Keep the people roster, public profiles, campus chat and message mute available.

Validation: production build and 560 remaining regression tests pass. Desktop and 320-pixel phone previews show no finder controls or remote-person map markers; the phone reports no page overflow, with movement and view controls inside the screen.

## Nescafé voice session limits — 13 October 2026

- Limit each signed-in visitor’s café voice session to 10 minutes. Show the countdown and a one-minute warning, including with the café menu or campus tools hidden.
- Stop microphone capture and incoming audio at expiry while keeping café seats and drinks available. Show a two-minute cooldown before the next session.
- Apply the same cooldown to early leaving, disconnects and changing tables. Track it by authenticated account on the live server so refreshes and client-supplied timestamps cannot skip it.
- Keep a monotonic browser deadline as well as server enforcement, so a delayed signalling connection cannot leave microphone tracks running. Preserve the shared relay usage cutoff and avoid unnecessary relay renewal near the session end.

Validation: 565 regression tests pass, including exact warning/expiry boundaries, cooldown rejection and eligibility, device-clock skew, stale signalling, late microphone permission, and actual authenticated sockets retaining seats and drinks after expiry. The local 360-pixel preview shows the warning, end notice and cooldown; sipping remains available during the break.

## Nescafé table conversations — 13 October 2026

- Add opt-in live microphone conversations for up to four people seated at the same table, with listening-only mode, mic mute, individual caller mute and volume controls.
- Keep ordering and sipping available at every café chair during conversation. Closing the menu keeps voice active; a compact mic stop control stays available with campus tools hidden.
- Ask “Do you want to leave the conversation?” before ending an active table call or standing via café controls, Actions or movement; cancelling preserves seat and voice.
- Show a brief “You left the table conversation.” confirmation after leaving an active call, including standing via café controls, Actions or movement.
- End calls on standing, activity changes, tab hiding or disconnect. Cancel late microphone permission responses and isolate stale signalling with server-assigned join IDs.
- Reuse the authenticated presence connection and monitored Cloudflare relay, including shared usage reporting and the existing 900 GB early cutoff. Bound audio links and retries; reject video/data-channel offers.
- Correct incoming-call transceiver attachment so connected calls transmit audio in both directions.
- Add “Coffee and conversation” to the visitor update feed.

Validation: authenticated table isolation and voice lifecycle tests; four real Chrome WebRTC callers over TURN each received three decoded synthetic audio streams. Ordering, sipping, muting and standing were verified without real microphone capture. Backend and frontend must be published together; separate-device Safari/phone voice still needs rehearsal.

## Nescafé coffee breaks — 12 October 2026

- Add a shaded terrace with four tables, 16 shared chairs, planting and warm evening lights. Serving windows face the shaded tables and the adjacent long wall, matching the owner’s corrections; there is no separate entrance.
- Choose free virtual coffee, cold coffee or water at the counters. Avatars hold a drink, take a sip and put it away; sitting and standing preserve the drink. Nearby players see the same drink and sip animation.
- Offer a compact action menu once per café visit after stopping at the counter. Highlight the selected drink and keep drink-specific sip, put-away, café sitting and standing controls together; dismissing the menu preserves walking focus.
- Introduce a general “What’s new on campus” notice and in-campus update feed covering new experiences visitors can use and explore, with maintenance notes kept in this changelog. Remember acknowledged entry IDs, automatically flag new entries, and offer useful exploration shortcuts. Campus tools and the website update log share the same feed.
- Validate orders against the authenticated player’s accepted position, counter proximity, movement and activity. Drinks expire after five minutes and clear for interiors, vehicles and games.
- Keep older open browsers compatible with café seating so new seat IDs cannot make the shared player roster disappear.

Validation: 545 regression tests and the production build pass, including two authenticated WebSocket peers, seat exclusivity and server validation. Chrome visual rehearsal verified all three drinks, seated sipping, standing and putting drinks away, around 60 fps on the development computer. Physical-device and distributed-network performance still require rehearsal.

## Football and concert update — 11 October 2026

- Follow-up football stutter fix: cached stadium shadows with one moving contact-shadow layer, shared animated opponents without distance-based model rebuilds, lighter translucent controls, and automatic recovery based on slow-frame timings. Grass matrices no longer re-upload when quality changes.
- Reduce football rendering work with a field-centred shadow pass, nearby greenery and automatic graphics headroom. Keep remote avatar positions stable through detail changes and merge the ball into one draw call.
- Make the football camera follow acceleration more closely. Gather camera collision candidates once per boom, preserving building, tree and pole clearance.
- Make football acceleration more responsive while keeping the existing speed limits. Add Q / Pass, Space / Shoot, a readable aiming arrow and a higher football camera.
- Keep phone Pass and Shoot beside the movement pad, accepting separate movement, running and kicking fingers. Collapse help and manual kickoff to keep the pitch clear.
- Smooth the shared ball with buffered snapshots, bounded prediction and explicit kickoff resets. Fixed-rate server physics, measured-speed dribbling and short buffered presses improve ball contacts.
- Use accepted pose progress to avoid false corrections during healthy network delay. Give teams separate spawn slots facing the proper goal, and share accepted kick animations.
- Budget detailed football avatars by distance and graphics quality; other players retain light team-coloured models and smooth motion.
- Celebrate shared goals with team-coloured confetti and a short score banner. Keep the burst within the kickoff countdown, avoid replaying it on reconnect and respect reduced-motion preferences.
- Automatically seat concert audience avatars, reserve their places through stage turns, and show seated participants to nearby visitors. Leaving restores walking at the OAT entrance.
- Display shared monitored voice usage to concert participants, including minimized controls.

Validation: 526 regression tests and production build; includes 24 authenticated loopback football peers, graphics recovery/collision checks, goal celebration timing/reconnect checks and full-campus phone layout rehearsal. Physical-device latency depends on the connection and hardware.

## Feedback update — 8–9 October 2026

This release collects the improvements made after visitors reported blocked walking, vehicle interruptions and confusing OAT sitting feedback.

### Movement, arrivals and multiplayer

- Preserve held WASD input when control callbacks change, restore canvas focus after arrivals and clear input when genuinely leaving or pausing the experience.
- Avoid false “Path blocked” messages during tiny acceleration steps. Place building arrivals outside accessible entrances, with CSE and ECE facing the OAT.
- Preserve local momentum through delayed multiplayer packets, while keeping legitimate position corrections and relocation handling.
- Keep bicycle and buggy turning continuous instead of resetting movement on delayed state updates.
- Add shared, speed-based buggy impacts with bounded recoil and smooth remote playback.
- Increase bicycle speed from 7 to 9 m/s (about 32 km/h) and buggy speed from 9 to 12 m/s (about 43 km/h). Match acceleration, braking, server limits, remote animation and sound to the new speeds; walking speed is unchanged.
- Allow simultaneous phone movement and action touches. Disabled actions no longer capture pointers belonging to active movement.

### OAT and avatar

- Make Actions → Sit explain when to stop, dismount or approach an OAT bench; show request status and resolve server acknowledgements without indefinite loading. Moving restores standing.
- Add saved girl and boy avatar choices, refined faces, fuller swept and curtain fringes, clear front/back details and clean varsity styling without backpacks.
- Improve articulated movement, layered clothing and expressive actions on the shared avatar model.

### Campus, loading and controls

- Rebuild the landscaped Main Entrance using mapped lanes, and extend the approach to NH66 with shared exterior access and full gateway framing.
- Introduce a black-and-gold AK loading intro with a 3D reveal and the creator credit “Made by Aryan · 23ECE1006.” Keep one continuous intro across code loading and campus preparation; remove the rotating circle.
- Keep Rotate as the default overview drag action. Offer Move in Controls for desktop drag-to-pan, while retaining scroll and pinch zoom.
- Make panels consistently translucent across day/night, desktop and mobile, with readable text and reduced blur on touch devices.
- Compact social actions, collapse advanced sound controls and allow chat and concert panels to minimize without leaving the live session. Keep a stop control accessible for an active microphone.
- Keep popovers inside the fullscreen explorer and improve short landscape viewport layouts.
- Enable Firebase Analytics for campus visits and activities.
- Publish the public What’s new page and this changelog.

### Validation and operating limits

- Automated coverage includes OAT action acknowledgements, held input, delayed multiplayer packets, vehicle turns, maximum-speed gate/canal crossings, obstacle checks, braking and buggy impacts.
- Reviewed responsive controls on phone portrait, phone landscape, tablet and desktop viewports.
- Live multiplayer remains limited by the configured room capacity and Render service resources. These checks do not establish a guarantee for every device or network; see [multiplayer verification](docs/multiplayer-reliability.md) and [mobile verification](docs/mobile.md).
