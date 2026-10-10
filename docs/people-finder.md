# Campus people finder

Avatar mode includes a compact translucent finder, enabled by default. Choose a person from its list, their coloured minimap marker, or **People & chat → People → Find**. The card shows straight-line distance, a direction arrow relative to the avatar's facing direction, and the nearest campus landmark or indoor building/floor. This guides exploration without relocating the avatar or claiming a collision-safe walking route.

**Mute people finder** hides its markers and guidance on your screen. **Show my finder location** in the People tab controls whether others can find you; both settings start enabled and persist on this browser. Per-person Mute hides that visitor's chat and finder marker for the visit. Hiding a location is not an invisible-avatar mode: nearby visitors on the same floor can still see the avatar, and shared football/concert participation remains visible in those activities.

Location visibility belongs to the authenticated WebSocket sender. A request cannot change another person's setting. The server publishes the visibility flag and withholds an opted-out person's coordinates, impact anchors and seated state from viewers beyond 160 metres, on another floor, or without an active walking pose. Their own accepted pose remains available for reconciliation. Nearby physical avatars and vehicle physics continue to use the accepted server position. Reconnection reapplies the saved preference before the client's walking publications; an unconfirmed preference produces a notice.

Finder UI reads the existing snapshot ref at four updates per second, without an additional connection or per-frame App updates. Snapshot age uses monotonic receipt time to tolerate device clock differences. Hidden, inactive, absent, muted and stale positions do not remain in the finder. Opt-out filtering keeps the normal single-serialization broadcast path when everybody shares their location; no location history is stored for this feature.

Local validation: 471 regression tests pass, including real two-peer authenticated WebSocket visibility changes, forged target IDs, strict boolean validation, distant/other-floor redaction, nearby-avatar preservation, passenger snapshot validity, interpolation clearing, direction maths, floors and stale/departed targets. Brave desktop and 320/390-pixel iframe previews checked the finder, minimap selection, target departure, per-person mute and sharing controls. Phone card height moves the minimap below it; landscape prioritizes the compact finder. The visual preview uses simulated visitors and provides no account or server identity.

Local visual previews:
- `/tests/fixtures/people-finder-preview.html`
- `/tests/fixtures/people-finder-mobile-preview.html`

These changes are local and have not been published to Render or GitHub.
