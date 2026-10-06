# Campus welcome page

The welcome page uses warm ivory, forest green and sage, with an official campus photograph softly blended into the hero and compact cards for walking, football and the OAT. Long promotional/profile sections are removed. The header and footer show NIT Goa's real emblem, framed from the original locally hosted wordmark; source and asset details are in `public/brand/README.md`. The page identifies the project as an independent campus experience.

Google sign-in retains its existing account selection, popup/redirect fallback, error handling and access checks. Profiles stay optional. Signed-in visitors can enter the campus directly. Experience cards open existing campus URLs, preserving the selected location or concert invitation through the normal sign-in page. Admin entry remains available in the footer; authorization stays on the existing server paths.

Card illustrations are native SVG; the home page does not mount the 3D campus renderer. The 30,556-byte logo and 147,686-byte original campus photograph are hosted locally. CSS applies gentle colour grading and a feathered mask without altering the real facade or signs. Reduced-motion preferences disable hover movement. Scrolling to sign-in also respects reduced motion. Illustrative card art is hidden from assistive technology, and navigation/Google sign-in controls have explicit labels.

Validation: the production build and all 393 existing tests pass. Chrome Guest review covered desktop, 390 px and 320 px emulated viewports, responsive cards and the OAT card's sign-in route with `concert=1&location=open-air-theatre` preserved. This does not replace physical phone/Safari testing or a fresh Google-account authentication rehearsal.
