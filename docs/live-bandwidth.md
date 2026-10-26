# Live room bandwidth

The frontend, map, images and ambient audio are served by Cloudflare Pages. Render still handles authenticated APIs, uploaded OAT backing tracks and the live WebSocket rooms. Moving static hosting does not reset Render's workspace-wide monthly usage. Render's Billing → Monthly Included Usage separates WebSocket responses, HTTP responses and service-initiated traffic; the aggregate HTTP total does not identify individual URLs or establish when frontend traffic moved.

## Changes on 26 October 2026

- Campus presence retains its 100 ms movement cadence. Clients advertising `campusDelta: 1` receive compact changed-pose tuples, changed profile/activity records, and departed IDs instead of a repeated full roster. Public movement coordinates are rounded to millimetres and headings to 0.001 radians on this transport only. Authoritative physics, collision handling and legacy full snapshots retain their original precision.
- A complete baseline is sent on admission and capability negotiation. Compact clients receive another full baseline at least every 30 seconds when publishing, or after a rate-limited explicit sync request. Invalid/missing delta baselines request a fresh full state. Every reconstructed snapshot passes the existing strict protocol validator.
- Privacy and seat compatibility filtering happen before maintaining each viewer's baseline. Moving to another floor, hiding a position or leaving cannot retain an old visible coordinate or duplicate a seat. Old browser tabs continue receiving full snapshots and never receive an unsupported packet type.
- Unchanged campus and concert state is suppressed, with a five-second keepalive below the existing ten-second watchdog threshold. Football retains its 60 Hz simulation and 20 Hz active broadcast opportunity; changed ball state, pose acknowledgements, scores and players publish normally. Quiet football state also uses the keepalive.
- All three WebSocket servers negotiate compression with supporting browsers. Fresh contexts, a 512-byte threshold, level-1 compression, a small window and a concurrency limit of two bound the added work. Authentication, origin checks, admission limits, payload limits and slow-client backpressure remain active. See the [ws compression guidance](https://github.com/websockets/ws#websocket-compression) for the memory/CPU tradeoff.
- Full-resync requests and repeated capability announcements cannot force unlimited full-roster responses.

The client still publishes its normal presence heartbeats. Reduced outbound rosters must not be confused with stale visitors: seated visitors, café calls and shared rides still require fresh authenticated presence.

## Reproduce the measurements

```sh
node --experimental-strip-types scripts/benchmark-live-bandwidth.mjs
node --experimental-strip-types scripts/benchmark-live-sockets.mjs
```

The deterministic replay covers 2, 8 and 32 synthetic visitors, moving and stationary, for one simulated minute. Every emitted compact packet is decoded and compared to the expected full scene. Compression estimates use the actual threshold and zlib settings; this report excludes network framing and is not Render billing data.

The socket check connects 32 synthetic authenticated clients to a loopback server and compares four seconds of moving visitors over legacy uncompressed full snapshots versus compact compressed snapshots. It measures actual received TCP bytes after initial admission. Reported process CPU and memory include both the server and all test clients on the developer's computer. These checks do not establish free-host CPU capacity or physical-phone rendering performance.

Record measurements from the current source alongside the release. Workload, browser support, idle time, reconnects and participant count affect savings. There is still a finite monthly hosting quota; these reductions cannot restore an exhausted allowance or guarantee unlimited usage.

Release measurements on 26 October: the 32-client socket run received approximately 11.88 MB over uncompressed full snapshots versus 0.55 MB over compact compressed snapshots, about **95% fewer wire bytes**. Both runs delivered 1,248 snapshots and rejected none. The deterministic moving replay reduced payload by about 69%, 93% and 96% for 2, 8 and 32 users respectively; stationary replay payload fell by more than 99%. These are synthetic results, not a forecast for the next Render bill.

## Deployment and rollback

Deploy the backend first, then the frontend. Existing tabs benefit from compression and idle suppression immediately; visitors need to refresh for compact deltas. An updated frontend can connect to the old backend because the delta capability is optional and older servers continue publishing full snapshots. Reverting the backend preserves that full-snapshot fallback. No new credentials, hosting plan or billing authorization is needed for this implementation.

If Render has suspended the workspace, the optimization must wait for hosting to resume before a backend rollout. Verify the quota state in Render rather than claiming a successful live deployment based on a GitHub push. After rollout, compare the next active session's Render WebSocket metrics with actual visitor-hours and check movement, seat sharing, café voice and football with separate accounts.
