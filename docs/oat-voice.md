# OAT microphone delivery

Join the concert, take the stage, and select **Start live microphone**. The browser asks for microphone permission. **Mic live** appears only after the server confirms the microphone state. The input meter checks capture; the performer status reports connected listeners. Audience members see a received-voice meter, **My sound**, volume and **Retry voice connection** near the top of the panel. Joining unlocks audio directly within the click/touch gesture, before signaling or permission promises complete.

`OatAudio` owns one Web Audio context for local backing music, received voice and the microphone/backing mix. The microphone never feeds the performer's speakers. Received WebRTC audio has a muted media-element sink to activate Chromium's decoder, then an analyser and gain control in the unlocked audio graph provide audible playback. This avoids depending on a later unmuted `audio.play()` call, which mobile autoplay policies can block. Muting a listener does not mute capture or other audience members. A muted listener may still see received input activity.

The audience pauses separate backing music only while the mixed voice stream is connected and its audio graph can play. Disconnection, track mute or suspended audio restores the separate track. Offers, answers and ICE candidates carry a connection generation so delayed signaling cannot damage a replacement connection. Failed or stalled voice connections retry with bounded backoff; transient network disconnection has a five-second grace period. **Retry voice connection** also enables sound and explicitly rebuilds the voice transport. Microphone permission is never requested automatically during reconnection. Capture and outgoing tracks stop on cancel, stage departure, concert departure or socket loss.

## Local rehearsal

Run the normal Vite server at `http://127.0.0.1:5176`, then:

```sh
node --env-file=.secrets/oat-turn.env --experimental-strip-types tests/fixtures/oat-voice-server.mjs
```

Open `/tests/fixtures/oat-voice-preview.html`. This development-only page uses the real session hook, real WebSockets and real browser WebRTC peer connections. Its loopback fixture server accepts only fixture identities. A synthetic tone replaces microphone input; no microphone permission or personal audio is used. Join both visitors, take the stage as performer and start the microphone. The listener's received-voice level should be nonzero. Check mute/unmute, listener and performer simulated failures, stopping/restarting the microphone, ending the stage turn and a late listener joining. RTP byte growth alone does not establish audible delivery. The fixture is excluded from the production build.

`tests/oatAudio.test.mjs` checks the unlocked graph, active capture, metering, local feedback isolation, mute/volume, replacement cleanup, decoder activation and bounded retries. `tests/oat.test.mjs` checks server authorization, microphone acceptance/rejection and signaling between two authenticated test connections.

## Network configuration

The selected no-card service is Metered's active **TURN Trial Global 500 MB/month** plan. Its dashboard states that quota exhaustion stops the relay; there are no overage charges. The advertised 20 GB free plan required a payment method in this account, so it was not activated. Cloudflare Realtime also required payment setup and was not activated.

Use a dedicated credential's scoped API key (not Metered's account-wide Secret key):

```dotenv
OAT_METERED_DOMAIN=<app>.metered.live
OAT_METERED_API_KEY=<dedicated TURN credential API key>
```

The Metered provider is preferred when these settings exist. The server fetches the canonical ICE list with UDP, TCP and TLS routes and caches retrieval for five minutes across participants. Only admitted OAT sockets receive that list; the API key is never returned to browser code. Configuration refresh is scheduled every 20 minutes. This refresh deadline **does not expire the underlying shared TURN credential**. Revoke/replace the dedicated credential if exposed, and monitor the small free quota before events. New credentials may need up to two minutes to propagate. See [Metered credential retrieval](https://www.metered.ca/docs/turn-rest-api/get-credential/) and [TURN quickstart](https://www.metered.ca/docs/turn-server-service/quickstart/).

### Cloudflare with usage protection

Set `OAT_RELAY_PROVIDER=cloudflare` explicitly to switch from Metered. This path requires the dedicated `OAT_TURN_KEY_ID` / `OAT_TURN_API_TOKEN`, `OAT_CLOUDFLARE_ACCOUNT_ID`, an account-restricted **Account Analytics: Read** token in `OAT_CLOUDFLARE_ANALYTICS_TOKEN`, and the provider's confirmed UTC allowance-period start in `OAT_TURN_CYCLE_ANCHOR` (`YYYY-MM-DD`). Keep all settings server-only. Missing or failing monitoring pauses voice; the server never switches automatically to Metered at the cutoff.

Usage polls every minute through Cloudflare GraphQL and totals **account-wide TURN egress**, which is the TURN billing metric. The admin crowd desk displays the amount, reading time, warning state and period end. Warnings appear at **700 and 850 decimal GB**; at **900 GB** the server rejects microphone starts, turns off the active microphone, broadcasts the pause to audience peers and revokes its outstanding credentials. The guard also pauses voice during a monitoring outage or when the last validated reading is over 90 seconds old. Campus presence, football and separate shared music continue.

Firestore transactions persist the maximum observed usage and quota latch per account/period. Restarts or lower subsequent readings cannot reopen an exhausted period. A new period requires a successful provider reading and checkpoint before voice resumes. Cloudflare credentials last ten minutes and refresh halfway through their lifetime, limiting exposure if the campus server sleeps or revocation fails. Provider credentials from before a process restart may survive until their original expiration. Server alerts contain only aggregate usage; tokens and provider responses are never logged. The 700/850 GB warnings appear in the admin desk and Render logs; they are not emailed. A separate Cloudflare account-wide **$0.01 spend alert** is configured to email the owner if unexpected charges occur, as a backup. It notifies after charges begin and does not enforce a cap.

On 11 October 2026 (India time), Cloudflare Realtime activation was verified. Billing reports the cycle **10 October–9 November UTC**, renewing **10 November 2026**; the server anchor is `2026-10-10`. The account-restricted analytics API returned a valid reading and the production Firestore checkpoint saved successfully. A real Chrome forced-relay rehearsal received decoded synthetic audio through Cloudflare (`relay → relay`, received level ~0.22). The controlled quota simulation then stopped capture, closed both peer connections and disabled microphone starts while both participants stayed in the concert. Fake high usage was confined to the loopback fixture's in-memory checkpoint.

This is an **application cutoff, not a guaranteed billing cap**. Provider reporting, polling, credential revocation and expiry can lag, and Cloudflare bills additional consumption above its free allowance. The 100 GB margin reduces this risk. Other TURN keys are included in the monitored total; SFU/other Realtime products may share the free allowance and are **not** included in this TURN query. Do not activate those products on this account without extending the monitor/reserving their usage. Confirm the allowance boundary in Billing before setting the anchor. No public client endpoint accepts usage figures or resets the cutoff.

For a controlled local test, run the loopback fixture with `OAT_FIXTURE_QUOTA=1` and the ignored Cloudflare env file, then open `/tests/fixtures/oat-voice-preview.html?relay=1&quota=1`. Start the synthetic rehearsal and select **Simulate quota cutoff**: both WebRTC peers and capture must close while the concert stays connected. The injected usage and in-memory checkpoint exist only in this development fixture and never write a fake quota to production Firestore.

See [TURN analytics](https://developers.cloudflare.com/realtime/turn/analytics/), [TURN pricing and expiry](https://developers.cloudflare.com/realtime/turn/faq/), [credential revocation](https://developers.cloudflare.com/realtime/turn/generate-credentials/) and [budget alerts do not cap usage](https://developers.cloudflare.com/billing/manage/budget-alerts/).

### Cloudflare credential delivery

The original integration remains available for accounts with Realtime activated. Set these **server-only** variables using a Cloudflare Realtime TURN key:

```dotenv
OAT_TURN_KEY_ID=<TURN key ID>
OAT_TURN_API_TOKEN=<TURN key API token>
```

Store them in ignored `.env.local` for local campus use, and the host's private runtime environment for deployment. The selected Metered credential is also stored in ignored `.secrets/oat-turn.env`, with owner-only file permissions, for the fixture command above. Do not use a Cloudflare account-wide API token or place a permanent key in browser code, `VITE_` variables, Git, or screenshots. The backend calls Cloudflare's pinned credential-generation endpoint and issues ten-minute credentials over the already authenticated OAT WebSocket when monitored Cloudflare is selected. Credentials are cached per participant, refreshed halfway through their lifetime, and updates use `RTCPeerConnection.setConfiguration()` for existing peers. A server throttle prevents repeated refresh requests. Provider responses and errors are never forwarded wholesale or logged.

Joining the room does not wait for the credential service. Voice offers wait for the initial relay response; signals arriving early are queued with a bounded size. A five-second provider timeout and a 7.5-second client deadline allow a direct STUN attempt if the provider fails. Relay failure retries after 30 seconds. The default Google STUN server discovers direct peer routes but cannot relay audio through restrictive networks. `VITE_OAT_ICE_SERVERS` remains an optional public STUN fallback for older deployments.

Open the fixture with `?relay=1` to **force** relay candidates. A passing rehearsal must show a nonzero decoded received-voice meter and relay candidate types, then recover a forced interruption. Test two separate Google accounts on the actual affected phone/network combinations before calling production voice reliable. The existing 24-person peer fan-out limit and admission checks remain in place. See [Cloudflare credential generation](https://developers.cloudflare.com/realtime/turn/generate-credentials/), [WebRTC TURN setup](https://webrtc.org/getting-started/turn-server) and [WebKit autoplay behavior](https://webkit.org/blog/7763/a-closer-look-into-webrtc/).

`tests/oatIce.test.mjs` checks participant-scoped credential caching and expiration, payload validation, authenticated-only delivery, refresh throttling, and generic fallback without leaking provider errors.

## Validation in this change

The full regression suite passed (482 tests), as did the production build. The dedicated **NITG OAT voice** Metered credential is active on the no-card 500 MB/month plan. Its scoped API key is saved in ignored local environment files with owner-only permissions; no account-wide Metered secret was used.

A real Chrome/WebSocket/WebRTC rehearsal with `?relay=1` passed with **relay → relay** selected candidates and decoded received audio (meter around 0.22–0.23), not just growing RTP byte counts. Audience mute/unmute worked. Forced listener failure rebuilt both connections and restored decoded audio; forced performer failure did the same. Stopping the microphone ended every outgoing track and closed the audience peer. The test used a synthetic oscillator, so no personal microphone audio was captured. Earlier STUN-only runs were intermittent; the verified relay path resolved that failure in this local rehearsal.

This validates the actual external relay with the real session hook and an isolated loopback identity verifier. It does not prove Google-authenticated delivery between two physical phones on the affected production networks. The release requires the private Metered runtime settings on Render; hosted verification is recorded in the [10 October release notes](https://github.com/Kumaryan12/nit-goa-3d/releases/tag/campus-update-2026-10-10). Rehearse with two separate Google accounts on different networks before a concert and monitor the small monthly quota.
