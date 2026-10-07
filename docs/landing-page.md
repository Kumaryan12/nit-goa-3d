# Campus welcome page

A dark cinematic campus hero uses oversized sans-serif typography, lime accents and Goa-inspired concept artwork. The composition is illustrative, not a photo or accurate map of NIT Goa. The real institute emblem is retained; promotional copy is brief. The scene is an eager local JPEG (about 654 KiB) and does not mount the 3D campus renderer. A short entrance animation respects reduced motion, as do card hover effects.

Google sign-in retains its existing account selection, popup/redirect fallback, error handling and access checks. Profiles stay optional. Signed-in visitors can enter the campus directly. Experience cards open existing campus URLs, preserving the selected location or concert invitation through the normal sign-in page. Admin entry remains available in the footer; authorization stays on the existing server paths.


Desktop and mobile use separate gradient overlays to keep text readable over the artwork. Mobile crops the scene toward the illuminated buildings, with the heading and Google sign-in above.

Imagegen production prompt:

Create a sophisticated cinematic 3D game environment inspired by a tropical university in Goa, not a photograph or faithful campus reproduction. Warm cream buildings with terracotta roofs, lush palms and tropical trees, winding paths, an illuminated amphitheatre and football pitch. Elevated aerial oblique camera, detailed architectural miniature, polished game aesthetic, atmospheric depth. Blue-hour teal dusk, amber windows and walkway lights, pine green shadows. Scene clustered on the right; left third dark for white heading. No text, logos, badges, UI, lens flare or glowing orb.

## Experience cards

Walking, football and OAT cards use original cinematic artwork matched to the hero: teal dusk, tropical foliage and amber lighting. Full-bleed image panels use a dark bottom gradient for readable captions and a lime arrow, with restrained hover zoom disabled for reduced motion. Images are local JPEGs, lazy-loaded below the hero; existing destination URLs and accessible button labels are preserved. Mobile uses full-width 300px panels.

Card prompts (built-in imagegen, hero used as style reference):

- Walk: a curving campus walkway between cream terracotta-roof university buildings, palms and lush gardens, inviting depth and amber path lights, no people.
- Football: a black-and-white football on textured grass, university pitch and goal beyond, cinematic floodlights, palms and campus buildings, low camera, no large stadium.
- OAT: intimate music performance in a curved open-air amphitheatre, tiny audience silhouettes and singer, amber stage beams and restrained violet lighting, palms and buildings beyond.

All three prompts request concept artwork in landscape format, full bleed, matching the hero, dark lower space for captions, and no text, logos, badges or UI.
