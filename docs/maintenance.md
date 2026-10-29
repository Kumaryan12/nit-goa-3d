# Temporary campus maintenance

All frontend routes display the maintenance page until **2 November 2026, 00:00 IST** (`2026-11-01T18:30:00Z`). `src/lib/maintenance.ts` owns the deadline. Open tabs check the deadline every second and when returning to the tab; the normal application loads automatically afterwards. A browser with an incorrect clock can switch at the wrong time.

The entry point lazily imports the community application only after maintenance. Sign-in, Firebase initialization, campus assets and live-room connections do not start while this page is displayed. The page is static on Cloudflare Pages and works while Render is suspended. Existing tabs already running an older deployment are not forcibly disconnected. This is a visitor-facing notice, not a backend access policy.

The page uses existing concept artwork, a countdown, the institute emblem and the Aryan / 23ECE1006 credit. It supports narrow screens, scrolling, keyboard navigation and reduced-motion preferences.

Build and publish the full Pages frontend normally. This notice does not reactivate Render or deploy the pending bandwidth changes to its backend; verify backend availability separately before reopening. Adjust the deadline and republish if maintenance needs to continue.
