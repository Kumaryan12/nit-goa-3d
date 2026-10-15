# Chapora movie nights

Release: 15 October 2026. The matching backend and Pages frontend must be published together.

Open **Screenings** in the campus toolbar or **Movie screenings in Chapora** in the Seminar Complex details. Only the Firebase-verified campus administrator can prepare, play, pause, seek or end a screening. The server derives this authority from the existing pinned owner policy; the visible host form does not grant access. Preparing a video leaves it paused. The host can watch from an assigned seat as well as control playback.

Visitors choose **Join screening** to take one of 32 assigned Chapora seats facing east toward the screen. This shares the existing 32-person campus capacity. Seats are published from the same terrain and hall layout as the browser, rather than supplied by a client. Ordinary actions, vehicles and jump controls are unavailable while watching. Leaving returns the local avatar to the clear centre aisle; choosing another destination honours that destination. Nearby visitors see seated avatars in `seminar:0`. Existing privacy filtering still hides their coordinates from other buildings and distant visitors.

The movie displays on the physical stage screen using one HTML player. **Cinema view** enters fullscreen on supported browsers. Each viewer starts muted and explicitly enables sound, with personal volume and mute in both the panel and player. Closing/minimising controls keeps the screening running. Hidden tabs pause local decoding and catch up when visible again. Leaving, disconnection or ending the screening releases the player and media resources. Reconnection attempts to reclaim an available seat rather than assuming the former seat is still free.

Use a supported YouTube link or public HTTPS `.mp4`, `.webm` or `.m4v` link. The source must permit playback in the viewer's browser. There is no video upload, URL-fetching proxy or protected-service integration. Film data streams directly from its source to each viewer; it does not travel through Render or the voice TURN relay. Source-host bandwidth and each viewer's internet connection still apply. Existing files hosted on the campus origin use that origin's bandwidth.

One server timeline controls playback, including late arrivals, host seeking and pauses. Small direct-video drift uses a bounded playback-rate nudge; larger drift seeks once. Sync requests run every ten seconds on the existing authenticated presence socket, rather than opening a video or voice connection between every pair of visitors. Media changes have a session ID so delayed controls cannot affect the next film. Disconnecting or revoking the host's role pauses playback; reconnecting does not resume it automatically. Timelines are capped at four hours. A watching host's natural end event pauses the timeline. Screening state is in memory and clears on server restart.

Quiet chat and four reactions are available only to seated members. Chat is rate limited and bounded to 40 messages from the current film. Nonparticipants receive screening status without chat history. Existing moderation message removal also clears that sender's screening chat.

YouTube uses its official IFrame API, privacy-enhanced embed host, an exact parent origin and an explicit origin-only referrer policy. CSP adds only the required YouTube script and frame origins. The API is loaded only when a joined viewer selects a YouTube screening. Embedding-disabled, deleted, restricted or blocked videos show a playback error. YouTube ads, buffering and device autoplay rules can interrupt an individual viewer; this is shared best-effort playback, not a guarantee of frame-perfect distribution. For an event, rehearse the chosen film with separate accounts and actual audience devices before starting.

References: [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [HTML media autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [Drei HTML surfaces](https://drei.docs.pmnd.rs/misc/html).

## Local rehearsal

The loopback-only fixture uses synthetic identities and cannot run with `NODE_ENV=production`. It is not imported by the application or included in production builds.

1. Run Vite on port 5180: `VITE_FIREBASE_API_KEY= VITE_CAMPUS_SERVER_URL= npm run dev -- --host 127.0.0.1 --port 5180 --strictPort`.
2. Run `node --experimental-strip-types tests/fixtures/screening-server.mjs` on port 5182.
3. The rehearsal starts with a paused public MDN CC0 sample. Open `/tests/fixtures/screening-preview.html` for the host and append `?who=alice` or `?who=bob` in other tabs for audience members. Each identity can occupy only one tab. Use a regular Chrome or Safari window for media rehearsal; VS Code’s integrated preview blocked YouTube playback in our local check.
4. The panel reports connection failures, duplicate identities and unavailable screening support, with an explicit reconnect control. Transport interruptions retry automatically; hot reload disposes the old socket.
5. Prepare a public sample, join seats and check playback, seek, volume, fullscreen, chat, leaving and host disconnection. The fixture uses the real room, protocol, hook, panel, player and hall geometry; it does not bypass production Firebase verification.

Automated coverage includes link validation, forged host actions, stale sessions, late joins, pause/seek, full-room seating and reuse, host disconnection/revocation, four-hour cutoff, chat bounds, nearby privacy and malformed roster rejection, video drift/autoplay behaviour and real authenticated WebSocket peers.

Validation: all 576 regression tests and the production Pages build pass. A public direct-video sample played on the stage screen and in fullscreen. The user’s YouTube football video played in regular Chrome with audio and fullscreen, using the integrated preview as host and an independent synthetic audience identity. Blocked and buffering playback no longer receives repeated seeks; a successful YouTube start clears the blocked prompt. VS Code’s integrated player remained blocked, so it is not a verified playback surface. Browser checks included the compact 360-pixel panel. Independent Google-account playback and physical-device Safari/phone screening remain pre-event rehearsal work.
