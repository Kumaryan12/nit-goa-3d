# Campus bicycles and shared buggies

In **Walk with avatar**, choose **Bicycle** or **Buggy** near a campus road. Bicycles can also use mapped footpaths; steps are excluded. The mount search checks the nearest centreline within five metres and the walkable approach. If no safe spot fits, the controls explain where to move.

- W / Up: accelerate gradually.
- S / Down: brake; keep holding to reverse a stopped buggy. Bicycles do not reverse.
- A/D or Left/Right: steer. Touch arrows/joystick provide the same controls.
- Space or the Brake button: stop.
- F or On foot: dismount from your own vehicle at a nearby clear position.
- Pause, blur and hidden tabs stop the vehicle immediately.

## Share a four-seat buggy

There is one driver and three passenger seats on two benches. In the signed-in live campus, walk within four metres of a stopped buggy while on foot. The Walk controls show **Hop into [name]’s buggy** and its occupied seat count. The server assigns the first free passenger seat atomically. The driver alone controls the buggy. Passengers follow its position, heading and slope pitch, with normal movement/jump/vehicle controls disabled. When stopped, use **Get out** or F to leave. A full or moving buggy cannot be boarded, and moving passengers wait for a stop before getting out.

Boarding uses an authenticated `buggy-ride` action on the presence socket, with identity supplied by the verified connection. Clients cannot specify their seat or impersonate another rider. The server checks proximity, activity, outdoors/on-foot state, freshness, stopping and capacity, and rate limits boarding actions. Snapshot seat metadata is validated for legal driver links and duplicate occupancy. Passenger positions derive from the driver's accepted pose, rather than their submitted coordinates. Nearby chat follows that seated position. Driver dismount, relocation, leaving Walk mode, disconnect or a stale connection clears its passenger seats at the previous buggy location; the client chooses a collision-safe walking dismount. Passenger departure frees the seat. Membership and seats are transient within the running shared room, not persistent records.

## Movement and rendering

Bicycles reach 3.8 m/s (about 14 km/h); buggies reach 5.2 m/s (about 19 km/h), with reverse capped at 1.4 m/s. These limits preserve the server's existing presence speed bounds. Vehicles use small swept substeps and overlapping body-clearance disks against buildings, trunks, lamp poles, canals, campus boundaries and road edges. Steering checks the new footprint before applying rotation. Road segments are indexed in eight-metre cells. The camera follows steering gently, and vehicle and seat transforms follow road gradients.

The buggy has open sides, two cushioned benches, a canopy, windshield, headlights and rear lamps. Remote passengers render individual seated avatars at their assigned positions; only the driver's renderer creates a buggy body. Models include rolling wheels and bicycle pedalling. Lamps are decorative and add no extra real-time light sources to the nighttime crowd. There is no parked vehicle inventory or driver transfer. Football and explorable interiors stay on foot. Static obstacle collision runs in the client, as it does for walking; authenticated presence retains identity, capacity, speed and origin checks.

Validation covers frame-rate consistency, acceleration/braking/reverse/pause, road and path restrictions, thin walls/trunks/poles, body clearance during turns, safe mounting/dismounting, real-campus placement, seat capacity/reuse, illegal boarding, position spoofing, tilt bounds, slope transforms and driver departure/relocation. Authenticated WebSocket tests verify live boarding, passenger follow, vehicle changes, and seat cleanup across peers.
