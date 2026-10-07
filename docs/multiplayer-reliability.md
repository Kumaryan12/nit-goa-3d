# Multiplayer reliability

The owner reported intermittent missing players and loading with two visitors. Transport recovery and repeated campus generation were identified as gaps; the exact reported failure has not been reproduced with their two Google accounts.

## Connection and movement

### Mobile and initial arrival update · 2026-10-07

- Previously, simultaneous walkers used exactly the same deterministic Main Entrance spawn. This can cover one avatar with another even though both identities are present. Admission now reserves a distinct slot; the client finds its corresponding safe outdoor point before publishing its first visible pose. Candidate points respect existing terrain, building, tree, canal and boundary checks. Reconnecting the same mounted walker preserves their position. The real-campus test checks 32 independent arrivals, including clients that have not received any other pose yet; departures release reservations.
- Campus and football actors now render buffered snapshots, 100 ms behind the shared server timeline. At most 150 ms of horizontal prediction is permitted, capped by vehicle speed; a stalled feed holds its predicted position. Epoch, floor, visibility and vehicle changes reset the history. Histories hold at most eight frames per identity and removed identities are discarded. Campus metadata is indexed once per snapshot instead of searched by every actor on every frame.
- Campus, football and OAT connections detect ten seconds without valid live updates while visible, with a 1.5-second grace period after returning to the foreground. They then use the existing bounded transport retry policy. Background suspension alone does not trigger a reconnect. Access denials and duplicate-account denials remain permanent until a manual retry or sign-in. Concert recovery stops the microphone and does not restart it automatically.
- Football and OAT initial handshakes now allow 45 seconds, matching campus presence, and football publishing respects the existing client backpressure threshold. Google sign-in preloads its SDK before enabling the button so popup creation starts directly from the tap handler.

Validation for this update: **399 automated tests pass**, including full admission/queue/movement/security regressions, interpolation under irregular packet arrival, prediction limits, teleport/floor transitions, foreground recovery decisions, and real-campus arrival separation. The local 32-client transport check observed a snapshot interval p95 of 103 ms. TypeScript and production build pass.

Chrome checked the loaded campus in 320 × 568, 390 × 844 and 844 × 390 frames: no document overflow, with header, movement controls and view dock inside their viewport. Bicycle selection and the mobile Tools menu worked. The animated crowd fixture kept two/32 actors present and reported 60 fps on this desktop, with 33 draw calls for 32 distant actors. These are browser layout/render checks with local fixtures, not measurements from physical phones or two hosted Google accounts. See [mobile verification](mobile.md) for the reproducible check and remaining device rehearsal.

- Campus presence retries transport failures up to six times, with exponential backoff capped at 15 seconds plus jitter. Access denial, moderation, duplicate-account rejection and normal closure do not trigger retries. Manual rejoin remains available.
- Initial client handshake allows 45 seconds; server authentication allows 30 seconds. Existing pending-connection, per-IP, admission, token-expiry and moderation limits still apply.
- A rejected, valid same-epoch movement update that diverges significantly gets private feedback containing the server's accepted pose, at most once per second. The walker consumes it only for the current spawn and outside reserved seats/passenger rides. Movement and boundary checks remain strict.
- Admitted identities use a socket-indexed lookup. Each 10 Hz room snapshot is serialized once and shared with peers subject to existing backpressure. Closing an obsolete socket cannot remove a replacement's room record.

Each Google account has one campus connection. Visitors need **Walk with avatar** to appear as walkers; Overview visitors remain in the roster. Walkers see the same indoor floor or nearby outdoor visitors. Football and concert actors are excluded from duplicate campus rendering.

## Loading and rendering

- Both building and road requests settle before one worker generates the campus, avoiding a partial-arrival rebuild and walker respawn. Published map requests retry transient failures with the existing bounded retry policy. Building failures now have a retry button.
- An application error boundary offers a reload if rendering or a lazy chunk fails, including an old page trying to request an asset from a previous deployment.
- Campus crowd selection updates four times per second. Full avatar budgets are six/eight/twelve for Smooth/Balanced/Detailed, within 45/60/80 metres. Others use one merged mesh each, retaining their colour and coarse vehicle shape. Full avatar fixed-part geometry is shared and released after its last user leaves.
- Outdoor walking range remains 160 metres; Overview range remains 1200 metres. Other floors and hidden visitors are excluded. Names/reaction labels appear within 55 metres. Name captions no longer raycast the campus for occlusion, so nearby labels may appear over intervening walls; floor filtering still applies.
- OAT audience avatars use the same detail budgets independently of campus walkers; the performer retains a full avatar. Football rendering has its existing separate actor budget.

## Verification

- Full regression: 381 passing tests. TypeScript and production build pass.
- New transport test joins 32 clients simultaneously with a delayed test identity verifier, shares movement at 10 Hz, checks all identities/poses on every peer, queues a 33rd visitor and promotes them after a departure. Observed local snapshot interval p95: approximately 104 ms. This is a short local transport check, not a Firebase throughput or internet latency benchmark.
- A two-peer test rejects an excessive movement jump, verifies that only its sender receives correction, then checks a legitimate corrected move appears to the other peer. Existing authentication, chat, queue, moderation, vehicle and movement tests remain passing.
- Crowd selection checks detail limits, distance, hidden players, excluded identities and indoor floors. Recovery policy checks bounded retries and permanent access failures. Published map loading checks a transient 503 followed by a successful snapshot.
- Chrome Guest mode checked the development-only rendering fixture at `/tests/fixtures/multiplayer-preview.html`: 32 visitors were visible, switching two/32 and near/wide views kept avatars present, and distant rendering used 33 draw calls (32 visitors plus ground). The isolated fixture reported 60 fps; it does not measure the full campus or mobile performance. The fixture is excluded from the production build and provides no authentication bypass.
- A separate local campus preview finished building/road loading, enabled Walk mode, and rendered the avatar and street lighting in night mode. Live Overpass used its documented nearby fallback in that preview; production uses the bundled verified snapshot.

## Operating limits

The deployment remains a single free Render instance, with 32 campus places and up to 100 queued visitors. Free-host wake-up can still delay first loading. Retries improve recovery but do not guarantee uninterrupted service or smooth rendering on every device. Independent hosted Google-account rehearsal and a longer full-campus load test remain necessary before an announced gathering. No paid host upgrade or capacity increase is part of this change.
