# Account startup recovery

11 November 2026: the welcome page previously hid its content behind Firebase restoration and the Node account check. `campusAPI` started its timeout only after token acquisition, and one 15-second failure ended admission without retrying. A cold Render response can also be HTML, which surfaced as a JSON parsing failure instead of a recoverable connection problem.

## Current behavior

- The public welcome page renders while identity/account checks run. Its entry area reports restoration/connection status and does not start a duplicate Google sign-in during a pending check. Public updates and profile directory routes do not wait for the viewer's account admission.
- Profile, directory and crowd-desk modules load when opened. The welcome shell no longer downloads all three eagerly.
- Firebase SDK setup and the initial auth observer have bounded waits. A stalled observer offers Retry; the observer remains subscribed so a late legitimate result recovers automatically. Failed shared SDK initialization promises can be retried.
- Every API request has a deadline covering token acquisition, fetch and response-body parsing, composed with caller cancellation. A cancelled token request cannot later send its bearer token.
- Only the read-only account check automatically retries. Up to four attempts of 12 seconds use 1/2/4-second backoff within a 60-second overall budget. Network/timeouts and selected transient HTTP statuses can retry; 401/403 and invalid/mismatched identity responses cannot grant access or retry as a cold start.
- The check is cancelled when the account changes or its effect is replaced/unmounted. Successful responses must match the current Firebase UID, active status, supported role and valid avatar style. No browser role/profile cache is used to bypass admission. Server verification, suspension and owner policy remain unchanged.
- Writes such as saving profiles or moderation are not automatically replayed. The existing periodic access refresh remains in place.

`tests/accountStartup.test.mjs` checks cold-host timeout/HTML recovery, bounded failure, account-change cancellation, stalled token/body stages, no late bearer transmission, invalid/denied admission, auth watchdog cleanup and late recovery. The standard full suite and production Pages build remain required. These checks simulate stalls locally; they do not make the free hosting service always-on or remove provider cold-start time.

Implementation: `src/lib/accountRequest.ts`, `src/lib/authStartup.ts`, `src/hooks/useAuth.ts`, `src/lib/firebase.ts`, `src/components/CommunityApp.tsx` and `LandingPage.tsx`.
