# NITG Explored deployment

The app runs as one Node 24 service on Render: the landing page, profiles, authenticated football and OAT use the same HTTPS origin. `render.yaml` uses the existing Dockerfile, Singapore, one instance, `/readyz`, and an explicit free plan for initial testing. Automatic deployment is off until launch verification succeeds.

## Provisioned Firebase project

- Project: `nitg-explored-2026`, display name **NITG Explored**.
- Created in the Google account selected by the user.
- Web app created and Google sign-in enabled. Email/password and anonymous sign-in disabled.
- Firestore `(default)` created in Mumbai (`asia-south1`), free tier, deletion protection on.
- `firestore.rules` deployed; all browser reads/writes denied. The Node Admin SDK handles database operations after authenticating the visitor.
- `.env.local` has the public web configuration and project ID and is ignored by Git/Docker.
- Localhost and `127.0.0.1` are authorized for local sign-in testing. Add the actual Render hostname before testing hosted sign-in.
- Billing is not attached. No photo-storage bucket is provisioned. The gallery remains an explicit read-only illustration demo.

## Runtime permissions

The dedicated identity is `campus-runtime@nitg-explored-2026.iam.gserviceaccount.com`. The user explicitly approved the following roles and private key setup after automatic permission review required their exact scope. Both roles are now applied, and live SDK checks verified Firestore access and Firebase account read permissions. The local key is held in ignored `.secrets/firebase-admin.json` with owner-only directory/file permissions (700/600).

For this app's runtime only, the approved project-level roles are:

| Role | Purpose |
| --- | --- |
| `roles/datastore.user` | Read and write this project's Firestore profiles, protected memberships, public profile copies, handle registry, authenticator records and audit logs |
| `roles/firebaseauth.viewer` | Read Firebase user status for verified email, disabled-account and revoked-token checks |

These roles give the runtime access to private campus data and are server privileges. They are not granted to visitors or stored in the browser. Store the dedicated service-account JSON key as Render's private runtime file `firebase-admin.json`, accessed through `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json`, and keep any local copy in ignored `.secrets/` with owner-only permissions. Never commit it or put it under `VITE_*`. Rotate/revoke the key in IAM if compromised. Prefer workload identity over long-lived keys if the selected host later supports it.

The checked-in deployment requires the runtime secret in Render before `/readyz` can pass. Local Google sign-in and campus admission have succeeded; hosted sign-in still requires the Render domain and deployment.

## Render setup

1. Sign in to [Render](https://dashboard.render.com). Connect the campus repository, use the `deploy/firebase-community` branch, and create a Blueprint from `render.yaml` (or a Docker Web Service with the same settings).
2. Provide `VITE_FIREBASE_API_KEY` from local `.env.local`. Upload `firebase-admin.json` and `moderator-secret.key` as Render secret files. The latter contains 32 random bytes encoded as base64 and is read through `MODERATOR_SECRET_KEY_FILE`. Both filenames are excluded from the Docker build context. Preserve the moderation key across deployments: replacing it makes existing authenticator records unreadable and invalidates tickets.
3. The server defaults to Render's assigned HTTPS origin through `RENDER_EXTERNAL_URL`. For a custom domain, set `SITE_URL` to its exact HTTPS origin, without any path or wildcard. Public `VITE_FIREBASE_*` settings must be present while Docker builds; the Dockerfile declares their build arguments.
4. In Firebase Authentication → Settings → Authorized domains, add the exact assigned Render hostname. Keep `VITE_FIREBASE_AUTH_DOMAIN=nitg-explored-2026.firebaseapp.com` unless explicitly configuring a custom authentication domain.
5. Build/deploy and check `/healthz` and `/readyz`. Readiness tests Firestore access and returns 503 while the database/credentials are unavailable. Never change the readiness check to bypass missing permissions.
6. Complete a real Google sign-in, create a profile, test public/private switching, then exercise live rooms with two independent Google accounts.

Only one instance is supported in this release: game state, queues and uploaded concert audio are in memory. Profiles and moderation logs persist in Firestore. [Render WebSocket guidance](https://render.com/docs/websocket) applies to the live endpoints. A free Render service sleeps after inactivity and takes time to wake; it is suitable for validation, not uninterrupted scheduled concerts. Read [free-service limits](https://render.com/docs/free) before launch. No paid service or billing upgrade is authorized by this Blueprint.

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

The tests cover role spoofing, verified Google identity, first-visit private profiles, unique handles, publish/unpublish, moderator hierarchy, atomic audit authorization, TOTP encryption/reuse/lockout, room admission, queuing and the existing campus geometry/game/concert behaviour. Unit database tests use a transaction-shaped test store; they do not prove deployed IAM or OAuth success. Deployed rules and actual browser sign-in must be checked separately. Docker image execution requires a running Docker engine.

## First moderator

After your first real Google sign-in, your ordinary membership is created at `campusMembers/YOUR_FIREBASE_UID`. As project owner, set that record's `role` to `admin` through Firestore console (keep `status: active`). Use the Firebase UID from Authentication, and verify the intended account. No public profile or user-supplied claim can appoint a moderator.

Refresh the app, open Crowd desk, confirm the same Google account, then enroll an authenticator. TOTP setup requires a Google login from the last five minutes. Tickets last ten minutes; reused codes are rejected and five failed code attempts lock verification for fifteen minutes. Refresh/reverify when a ticket expires. To recover a lost authenticator, the project owner removes only that account's `moderatorFactors/UID` record through trusted administration, then has the moderator re-enroll after Google reauthentication.

## Launch verification and limits

- A signed-out or suspended account cannot fetch crowd identities or receive live state.
- A normal member cannot invoke moderation or edit protected roles.
- Two accounts can play with the same ball; a duplicate tab in the same room is rejected.
- Room capacity is 24 with 100 waiting places; promotion follows arrival order.
- Ban/kick removes live sockets; end-stage stops performer transmission. Wait/leave/sign-out stops local microphone and media resources.
- Test public/private profiles and handle changes from a separate signed-out browser; public API caches expire in 30 seconds and are cleared on app edits/moderation. Previously shared copies cannot be recalled.
- Test tracks, microphone permission, late join, restrictive networks and TURN relay. OAT uses performer-to-listener WebRTC: test within the cap before concerts. Larger audiences require an SFU and shared state; raising caps or adding instances alone is insufficient.
- Audio uploads are temporary: 12 MB each, four retained files. Their random links can be shared while active. Restarts clear music, queues and game state.
- Schedule Firestore backups, monitor provider quotas/errors, and review moderation logs. The repository does not claim a completed independent security audit or production load test.
