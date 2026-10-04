# Campus bicycles and cars

In **Walk with avatar**, choose **Bicycle** or **Car** near a campus road. Bicycles can also use mapped footpaths; steps are excluded. The mount search checks the nearest centreline within five metres and the walkable approach. If no safe spot fits, the controls explain where to move.

- W / Up: accelerate gradually.
- S / Down: brake; keep holding to reverse a stopped car. Bicycles do not reverse.
- A/D or Left/Right: steer. Touch arrows/joystick provide the same controls.
- Space or the Brake button: stop.
- F or On foot: dismount at a nearby clear position.
- Pause, blur and hidden tabs stop the vehicle immediately.

Bicycles reach 3.8 m/s (about 14 km/h); cars reach 5.2 m/s (about 19 km/h), with reverse capped at 1.4 m/s. These limits preserve the server's existing presence speed bounds. Vehicles use small swept substeps and overlapping body-clearance disks against buildings, trunks, lamp poles, canals, campus boundaries and road edges. Steering checks the new footprint before applying rotation. Road segments are indexed in eight-metre cells. The camera follows steering gently, and the local body follows road gradients.

Vehicle selection and position travel through the authenticated campus presence channel, so peers see seated riders and vehicle models, including mount/dismount changes. The protocol rejects unknown vehicle names and riding inside buildings. Existing clients without the optional field still work. Football and explorable interiors stay on foot. Vehicles are personal exploration models; there are no passenger seats or parked vehicle inventory. Presence still enforces identity, capacity, speed and origin checks; static obstacle collision runs in the client, as it does for walking.

The models include rolling wheels, bicycle pedalling and emissive front/rear lamps. Lamps are decorative and add no extra real-time light sources to the nighttime crowd.

Validation covers frame-rate consistency, acceleration/braking/reverse/pause, road and path restrictions, thin walls/trunks/poles, body clearance during turns, safe mounting/dismounting, real-campus road placement, and authenticated two-peer WebSocket mount/dismount updates.
