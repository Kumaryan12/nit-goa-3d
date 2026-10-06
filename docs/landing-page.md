# Campus welcome page

The welcome page uses warm ivory, forest green and sage, with a floating SVG campus illustration and compact cards for walking, football and the OAT. Long promotional/profile sections are removed. The header and footer show NIT Goa's real emblem, framed from the original locally hosted wordmark; source and asset details are in `public/brand/README.md`. The page identifies the project as an independent campus experience.

Google sign-in retains its existing account selection, popup/redirect fallback, error handling and access checks. Profiles stay optional. Signed-in visitors can enter the campus directly. Experience cards open existing campus URLs, preserving the selected location or concert invitation through the normal sign-in page. Admin entry remains available in the footer; authorization stays on the existing server paths.

Illustrations are native SVG; the home page does not mount the 3D campus renderer. The only added raster asset is the 30,556-byte logo, hosted locally. The campus floats using a small CSS transform; reduced-motion preferences disable that animation and hover movement. Scrolling to sign-in also respects reduced motion. Illustrative card art is hidden from assistive technology, and navigation/Google sign-in controls have explicit labels.

Validation: the production build and all 393 existing tests pass. Chrome Guest review covered desktop, 390 px and 320 px emulated viewports, responsive cards and the OAT card's sign-in route with `concert=1&location=open-air-theatre` preserved. This does not replace physical phone/Safari testing or a fresh Google-account authentication rehearsal.
