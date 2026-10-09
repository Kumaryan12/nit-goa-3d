# NITG Explored deployment

The app runs as one Node 24 service on Render: the landing page, profiles, shared campus presence/chat, authenticated football and OAT use the same HTTPS origin. `render.yaml` uses the existing Dockerfile, Singapore, one instance, `/readyz`, and an explicit free plan for initial testing. Automatic deployment is off until launch verification succeeds.

## Live deployment

Google Analytics is linked to Firebase project `nitg-explored-2026`, GA4 property `558036355`, and web stream `G-BHE7F5D3XY`. Set `VITE_FIREBASE_MEASUREMENT_ID` at build time (including the Docker build argument). Open [Firebase Analytics](https://console.firebase.google.com/project/nitg-explored-2026/analytics) or [Google Analytics](https://analytics.google.com/analytics/web/#/p558036355/reports/dashboard?r=firebase-overview) with the owner account. Realtime shows current visits; regular reports take longer to process.

Production collection is lazy, skips local previews and browser Do Not Track/Global Privacy Control, and fails independently of authentication or gameplay. Events include sanitized route `page_view`, `login` (Google), `campus_enter`, `exploration_mode`, `select_building` (category), and `join_activity` (football/concert, after live admission). No account IDs, names, emails, profile handles, private query strings, coordinates, chat, microphone or uploaded content are supplied. Advertising consent is denied and Google signals/personalization are disabled. Automatic history pageviews/enhanced measurement should be disabled in this stream because the app sends sanitized pageviews itself. Allow only the named Firebase/Analytics endpoints in the server CSP.

- Campus: https://nitg-explored.onrender.com
- Render service: `srv-db0tjepsrm7s7394b09g`, Singapore, free, one Docker instance.
- Release branch: `deploy/firebase-community`. Render deployment history records the exact release commit.
- Docker builds and live deployments succeeded on Render. Production map loading was verified in a fresh hosted browser session.
- Real hosted Google sign-in completed and campus admission succeeded. Authenticated football joined with one player; OAT admission showed 1 / 24 visitors. Independent-account play and voice transmission still require rehearsal.
- Firebase and moderation keys uploaded as private runtime files. Neither is in Git, browser code or the Docker image.
- `/readyz` and the landing page return 200; anonymous admission/crowd requests are denied, and credential file URLs return 404.
- Both GitHub verification jobs pass; 271 tests pass and the production dependency audit reports zero vulnerabilities.

## Provisioned Firebase project

- Project: `nitg-explored-2026`, display name **NITG Explored**.
- Created in the Google account selected by the user.
- Web app created and Google sign-in enabled. Email/password and anonymous sign-in disabled.
- Firestore `(default)` created in Mumbai (`asia-south1`), free tier, deletion protection on.
- `firestore.rules` deployed; all browser reads/writes denied. The Node Admin SDK handles database operations after authenticating the visitor.
- `.env.local` has the public web configuration and project ID and is ignored by Git/Docker.
- Localhost, `127.0.0.1` and `nitg-explored.onrender.com` are authorized for Google sign-in.
- Billing is not attached. No photo-storage bucket is provisioned. The gallery remains an explicit read-only illustration demo.

## Runtime permissions

The dedicated identity is `campus-runtime@nitg-explored-2026.iam.gserviceaccount.com`. The user explicitly approved the following roles and private key setup after automatic permission review required their exact scope. Both roles are now applied, and live SDK checks verified Firestore access and Firebase account read permissions. The local key is held in ignored `.secrets/firebase-admin.json` with owner-only directory/file permissions (700/600).

For this app's runtime only, the approved project-level roles are:

| Role | Purpose |
| --- | --- |
| `roles/datastore.user` | Read and write this project's Firestore profiles, protected memberships, public profile copies, handle registry, authenticator records and audit logs |
| `roles/firebaseauth.viewer` | Read Firebase user status for verified email, disabled-account and revoked-token checks |

These roles give the runtime access to private campus data and are server privileges. They are not granted to visitors or stored in the browser. Store the dedicated service-account JSON key as Render's private runtime file `firebase-admin.json`, accessed through `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json`, and keep any local copy in ignored `.secrets/` with owner-only permissions. Never commit it or put it under `VITE_*`. Rotate/revoke the key in IAM if compromised. Prefer workload identity over long-lived keys if the selected host later supports it.

The checked-in deployment requires the runtime secret in Render before `/readyz` can pass. Local Google sign-in and campus admission have succeeded. The hosted domain is authorized and live readiness confirms its runtime Firestore access.

## Render setup

1. Sign in to [Render](https://dashboard.render.com). Connect the campus repository, use the `deploy/firebase-community` branch, and create a Blueprint from `render.yaml` (or a Docker Web Service with the same settings).
2. Provide `VITE_FIREBASE_API_KEY` from local `.env.local`. Upload `firebase-admin.json` and `moderator-secret.key` as Render secret files. The latter contains 32 random bytes encoded as base64 and is read through `MODERATOR_SECRET_KEY_FILE`. Both filenames are excluded from the Docker build context. Preserve the moderation key across deployments: replacing it makes existing authenticator records unreadable and invalidates tickets.
3. The server defaults to Render's assigned HTTPS origin through `RENDER_EXTERNAL_URL`. For a custom domain, set `SITE_URL` to its exact HTTPS origin, without any path or wildcard. Public `VITE_FIREBASE_*` settings must be present while Docker builds; the Dockerfile declares their build arguments.
4. In Firebase Authentication → Settings → Authorized domains, add the exact assigned Render hostname. Keep `VITE_FIREBASE_AUTH_DOMAIN=nitg-explored-2026.firebaseapp.com` unless explicitly configuring a custom authentication domain.
5. Build/deploy and check `/healthz` and `/readyz`. Readiness tests Firestore access and returns 503 while the database/credentials are unavailable. Never change the readiness check to bypass missing permissions.
6. Complete a real Google sign-in, create a profile, test public/private switching, then exercise live rooms with two independent Google accounts.

Only one instance is supported in this release: campus presence/chat, game state, queues and uploaded concert audio are in memory. Profiles and moderation logs persist in Firestore. [Render WebSocket guidance](https://render.com/docs/websocket) applies to the live endpoints. A free Render service sleeps after inactivity and takes time to wake; it is suitable for validation, not uninterrupted scheduled concerts. Read [free-service limits](https://render.com/docs/free) before launch. No paid service or billing upgrade is authorized by this Blueprint.

## Published map

Production serves the verified 2026-10-01 OpenStreetMap campus snapshot from `public/map/` on the app origin. Its 22 source building footprints, 11 source courtyard holes and 20 roadways are covered by the geometry tests. The displayed twin applies the owner-confirmed Gyan Mandir correction to show two courts where OSM records one continuous opening; Boys Hostel displays two open courts, closing a roofed area that OSM records as a third hole; its southeast courtyard includes the owner-confirmed badminton court. The original map snapshot stays unchanged. This avoids a live Overpass request for every visitor and makes first visits independent of public map API availability. The campus footer shows the map date and OSM attribution. Local development still uses live Overpass. To refresh the published map, update both JSON responses together and rerun campus geometry/navigation tests before deployment.

## Local use and checks

Use Node 24 (or a supported newer version):

```sh
npm ci
npm test
npm run build
npm audit --omit=dev --audit-level=high
npm run dev
```

Vite reads public configuration and server-only settings from `.env.local`. For `npm start`, the host supplies runtime variables; locally use `node --env-file=.env.local --experimental-strip-types server/index.ts` after adding the private credential file path. With no Firebase configuration, development offers a labelled campus preview. With real Firebase configured, sign-in works but campus admission needs server credentials.

The tests cover owner UID/email pinning, forged and legacy roles, direct admin API denial, safe sign-in return paths, verified Google identity, first-visit private profiles, unique handles, publish/unpublish, atomic audit authorization, TOTP encryption/reuse/lockout, room admission, queuing and the existing campus geometry/game/concert behaviour. Unit database tests use a transaction-shaped test store; they do not prove deployed IAM or OAuth success. Deployed rules and actual browser sign-in must be checked separately. Docker image execution requires a running Docker engine.

## Student and owner access

`/student` is the Google sign-in entrance and dashboard for all visitors. It links to the shared campus, optional profile and community. `/admin` is the owner's separate entrance and dashboard; `/admin/campus` exposes campus editing tools and `/admin/crowd` exposes the crowd desk. The normal `/campus` experience does not expose editing tools. The owner can also use the student experience. The legacy `/manage` path follows the same owner restriction.

The selected owner's verified Google UID and email are pinned in the private `campusSettings/access` document (`ownerUid`, `ownerEmail`). This policy was provisioned through trusted Firebase administration and recorded in `moderationLog`. Each admission verifies both against the Firebase account, requires an enabled account and Google-provider sign-in, checks revocation and membership status, then derives its role. Everyone else receives `member`, including accounts with old `admin`/`moderator` membership roles or custom token claims; active membership records are normalized on admission. Missing or invalid policy grants no administrator. Browser clients cannot read or change this configuration. Changing membership roles does not appoint another administrator. Owner replacement must be an explicit trusted administration operation that verifies the replacement Google account and updates both policy fields; never accept this through profile or public APIs.

Open `/admin`, then Crowd desk, confirm the same Google account, and enroll an authenticator. Admin actions recheck the pinned owner UID and active admin membership in their audit transaction before live state changes. TOTP setup requires a Google login from the last five minutes. Tickets last ten minutes; reused codes are rejected and five failed code attempts lock verification for fifteen minutes. Refresh/reverify when a ticket expires. To recover a lost authenticator, the project owner removes only their `moderatorFactors/UID` record through trusted administration, then re-enrolls after Google reauthentication.

## Launch verification and limits

- A signed-out or suspended account cannot fetch crowd identities or receive live state.
- A normal member cannot invoke moderation or edit protected roles.
- Two accounts can play with the same ball; a duplicate tab in the same room is rejected.
- Football/OAT each admit 24 visitors; shared campus admits 32. Each has 100 waiting places and promotes visitors in arrival order. `/presence`, `/football` and `/oat` WebSocket upgrades go to the same Node process. Verify nearby text delivery with walkers within 35 metres and rejection across hostel and Gyan Mandir floors. Public profile links appear only for published profiles; profile metadata refreshes within 30 seconds.
- Ban/kick removes live sockets; end-stage stops performer transmission. Wait/leave/sign-out stops local microphone and media resources.
- Test public/private profiles and handle changes from a separate signed-out browser; public API caches expire in 30 seconds and are cleared on app edits/moderation. Previously shared copies cannot be recalled.
- Test tracks, microphone permission, late join, restrictive networks and TURN relay. OAT uses performer-to-listener WebRTC: test within the cap before concerts. Larger audiences require an SFU and shared state; raising caps or adding instances alone is insufficient.
- Audio uploads are temporary: 12 MB each, four retained files. Their random links can be shared while active. Restarts clear music, queues and game state.
- Schedule Firestore backups, monitor provider quotas/errors, and review moderation logs. The repository does not claim a completed independent security audit or production load test.

Shared-campus verification: `tests/campusPresence.test.mjs` exercises two independent socket clients, movement and text delivery, nearby isolation, verified profile metadata, duplicate-account denial, full-room queue promotion, audited owner moderation, and startup using the Docker runtime files without browser-only data modules. These test identities replace Google verification only inside the test harness; production still uses Firebase verification and the pinned owner policy. Rehearse with two independent Google accounts on the hosted service before a public event.
