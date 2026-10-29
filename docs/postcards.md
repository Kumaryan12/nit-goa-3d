# Campus photo postcards

Open the camera icon beside View after campus has loaded. Drag or pinch/scroll using the existing camera controls to frame a moment, then press the shutter. The preview offers warm paper or midnight borders, landscape (1600 × 1200) or portrait (1200 × 1600), and a short caption. Download PNG works without a share service; a Share button appears when the browser supports sharing image files. The postcard includes the selected place, capture date in India, campus branding and OpenStreetMap attribution.

The framing view temporarily hides panels and labels without changing saved view preferences. Retake returns to the camera; Exit photo mode restores normal controls. Walking pauses while taking the shot or editing its preview. Other players and live rooms continue normally. Use the existing avatar actions before entering photo mode to pose.

Capture renders one extra frame and immediately copies it into a bounded 2D canvas (at most 2048 pixels on its longest side). It does not enable `preserveDrawingBuffer` or read pixels continuously. PNG composition runs only for a new capture or changed postcard options. Temporary canvas memory and object URLs are released when replaced or closed. Sharing and downloads run from user gestures. Images and captions never go to the campus server or Firebase.

The photo includes the WebGL scene and avatars visible there, without interface panels, DOM name labels or embedded web/video overlays. Portrait crops the middle of the captured viewport; review the preview before saving. Export reflects the active graphics quality and cannot create detail absent from the original rendered scene.

For local review, start Vite with an empty `VITE_FIREBASE_API_KEY` and open `/tests/fixtures/campus-ui-preview.html`. This development-only fixture renders the real campus without changing production admission or the maintenance deadline. Review both formats/themes, retake, close/Escape, repeated captures, portrait phone sizing, and a downloaded PNG. Unit coverage checks cropping bounds/aspect ratios, text limits and canvas allocation errors.
