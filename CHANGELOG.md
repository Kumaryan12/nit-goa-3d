# Campus updates

Public update log: [What’s new](https://nitg-explored.onrender.com/updates).

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
