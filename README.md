# Maxwell · 3D

A local Three.js adaptation of Maxwell's puzzling demon. All grid blocks use cubic dimensions. Rigid bodies have continuous surfaces, including concave outlines and holes. PBR materials distinguish matte housings, coated blocks, polished metal, and transmitting glass. Insulation and adhesive layers cover vertical faces and expose their cross-sections on top. Adhesive layers use six checker cells across each grid face. Clear squares expose the underlying surface; solid squares follow the local temperature color. The pattern follows continuous contours and rounded corner joints. Joined faces retain this layer at solid/glass and adhesive/insulated interfaces; homogeneous uninsulated solids merge without an internal seam. Glass has a clear refracting body, diagonal etched lines, and emphasized upper rims. Floor tiles use faint staggered scoring. Both surface patterns use monochrome color and roughness maps with mipmaps and anisotropic filtering. Number labels use a larger glyph area, a fine white keyline, and unlit ink to retain contrast across temperature colors and transparent surfaces. The renderer combines supersampling, multisampling, SMAA, board-fitted shadows, and ambient occlusion. Postprocessing targets match the canvas drawing buffer in physical pixels, including fractional display densities. Surface layers batch their faces by material. Orthographic camera distance and depth range contain the exterior terrain at every supported angle without changing projected scale.

## Run

Requires Node.js 22.12 or newer and a local installation of the game.

```powershell
npm install
npm run import:levels
npm run dev
```

Open the local address printed by Vite. To import from another installation:

```powershell
node scripts/import-levels.mjs "D:\SteamLibrary\steamapps\common\Maxwell's puzzling demon"
```

The importer reads the installation without changing it. The generated `public/levels.local.json` contains local game data and is excluded from Git. No original executable, music, or textures are included in the source project.

## Copyright and unofficial project notice

This is an independent, unofficial fan project for studying puzzle mechanics and experimenting with 3D presentation. It is not affiliated with, endorsed by, or an official release of muratsubo Games. [Maxwell's puzzling demon](https://store.steampowered.com/app/2770160/Maxwells_puzzling_demon/) and its original level designs, text, artwork, audio, and other game content remain the property of their respective rights holders. The game name identifies the original work; this project claims no ownership of it.

The Three.js implementation and generated 3D presentation are separate from the original game's content. Availability of this project's source does not grant a license to original game data or third-party content. The source checkout excludes the imported level catalogue and requires a legitimately obtained local installation for importing levels. The published web build includes imported level data; exclusion from the source branch does not remove that data's copyright or establish permission to redistribute it. Public redistribution of original content requires appropriate authorization from its rights holders.

This project does not distribute the original executable or provide a license to the original game. Please support the original release. Rights holders can raise attribution or distribution concerns through the repository's issue tracker. This notice records attribution and project scope; it does not establish authorization or guarantee legal clearance.

## Web deployment

The static web build runs at [komonad.github.io/mpd-3d](https://komonad.github.io/mpd-3d/). Build and publish from a checkout with imported level data:

```powershell
npm run build:pages
npm run publish:pages
```

GitHub Pages serves the root of the `gh-pages` branch. That branch contains compiled assets and the playable level catalogue; `master` retains the source project. Asset and catalogue URLs respect the `/mpd-3d/` base path. The Pages build writes to `output/pages-dist`; the local build writes to `dist`. Each deployment includes `version.json` with its source revision. Publishing preserves the deployment branch history and does not switch the source checkout.

## Controls

| Action | Input |
| --- | --- |
| Move | Arrow keys / WASD / touch directional pad |
| Undo / redo | Z or U / Y |
| Reset level | R |
| Enter adjacent portal | E / Enter / Space |
| Return from level or hint | Q / Backspace |
| Enter hint scene | H |
| Toggle piston numbers | Tab / number button |
| Toggle free camera | F / free-view button |
| Fullscreen play | V / fullscreen button; Esc exits |
| Show each motion and heat phase | Hold Ctrl while moving |
| Rotate camera | Right drag |
| Pan in free view | Middle drag |
| Zoom camera | Wheel |

New sessions start in the outermost entrance hall and follow its portals into the overworld and individual worlds. Progress, discovered shortcuts, cached room states, and entry baselines are saved in browser local storage. Quick jump provides direct access to the overworld, worlds 1–9, A, and B without changing completion progress. The overworld button opens the original outer map; canonical exits connect world maps to that map and its entrance hall. Saved rooms acquire missing outer parents without changing their current layout. Undiscovered shortcuts have gray labels, a dashed frame, and a lock symbol; discovering their target restores black labels. Ordinary entrances remain accessible before discovery. Hover descriptions use the same discovery rule as entry interaction. World-map entrances transform when their corresponding levels are completed. Undo includes resets, scene transitions, and completion progress within the current browser session. The header, scene, controls, and footer occupy separate layout rows; only the level list scrolls within the sidebar. Fullscreen play expands the game area and preserves its controls and camera.

## Saved solutions

The header's solution replay opens the verified route catalogue. Each route runs in an independent room session and leaves completion visible for inspection. Playback supports pause, previous and next operations, restart, a seek bar, operation selection, and speed control. Space toggles playback, Left and Right step through operations, and Q or Esc returns to gameplay. Ctrl exposes intermediate motion and heat frames during playback. Exiting restores gameplay progress and undo history; replay never writes completion to the gameplay save.

`src/solutions.json` stores 105 winning routes across worlds 1–9, including all 20 main rooms in worlds 1, 2, and 3, and 18 of the 19 main rooms in world 4. World 4 room 4-11 has no verified route. Routes include movement, reset, undo, and targeted room entry. Each record identifies its destination, operation sequence, route origin, optional video source, and final move and push counts. Catalogue routes start with every earlier numbered room completed and discovered, ordered by world and displayed room number. Extra rooms and the destination retain their initial completion state. A route can start in another scene; 2-1, 3-1, and 3-2 include their approaches from the world map. Nested destinations identify the containing room as their starting scene. World 3 routes preserve nested-room preparation, world shortcuts, changed exit directions, and spawn cuts. Cross-scene routes remain marked as such when their starting room matches their destination. The library shows the starting scene and completion condition; operation targets use displayed room numbers. Successful replay requires completion in the destination and matching counts. A winning route validates that sequence against the current engine; it does not establish complete equivalence with the original game. World 3 also has a verified continuous traversal of all 20 main rooms from an empty world-map session, including overworld shortcuts and map preparation, using 2,273 accepted operations. World 2 reference checkpoints compare adhesive bodies, transparent conduction, the updated 2-12 layout, and transparent-ring positioning with the source videos. World 3 checkpoints cover transition heat, spawn cuts, a movable mixed frame, nested shortcut direction propagation, fixed-wall cuts, and restoration of the full replay checkpoint when seeking. World 4 checkpoints cover cold storage, concave-body motion, carried inventories, and the intermediate expansion and retraction phases of supported loads.

The replay library can start a gameplay recording at the current scene. Accepted movements, targeted entries, explicit and automatic exits, hints, resets, undo, and redo remain in the operation sequence. Each completed puzzle saves the recorded prefix in the local library. The start snapshot preserves current and cached rooms, reset baselines, discovery and completion progress, entry sides, hint frames, serial counters, and pre-existing undo/redo history. Quick jumps establish a new recording start. Legacy routes without a start snapshot use the destination's initial layout and appear as room-only routes.

World 9 has 16 verified catalogue routes: 9-1, 9-2, 9-3, 9-4, 9-5, 9-7, 9-8, 9-9, 9-10, 9-11, 9-12, 9-13, 9-14, 9-21, 9-23, and 9-25. The 9-2, 9-4, and 9-5 routes include world-map preparation for multiple demons and discovered shortcuts. The 9-5 approach discovers room 9-6 before returning through its opposing entrances. These routes cover selected retentive resets, room re-entry, cuts, piston inventories, and thermal actuation. Reference checkpoints cover mechanical displacement of the overheated demon in 9-5, movement of the compressed housing and external frame in 9-11, the updated 9-14 temperature sequence, the simultaneous opening push in 9-17, and the retained load and final actuation in 9-25. Rooms 9-6, 9-15, 9-16, 9-17, 9-18, 9-19, 9-20, 9-22, and 9-24 have no verified catalogue routes; the 9-17 opening checkpoint does not establish completion.

Version 2 replay files embed their starts, optionally sharing a start through the file's `starts` table and `startRef` records. They accept version 1 room-only routes. A compact start can specify an initial scene with completed and discovered prerequisites. Its optional `completion: "previous-numbered"` condition resolves earlier main rooms against the loaded catalogue and applies their completed entrance properties and shortcut discovery. Personal recordings retain their actual starting progress and full room state. Seeking always reconstructs the full scene history from the recorded start. The library imports files after replay validation, exports individual routes, and removes personal recordings. Personal routes sharing one recording start store that snapshot once.

The replay toolbar exports a route as JSON. Verify the catalogue or an exported file with:

```powershell
npm run test:solutions
npm run test:solutions -- "D:\experiments\maxwell-solution.json"
```

## Level workbench

The header's level editor opens a separate project with its own browser draft. Copy an imported room or create a room, paint blocks, glass, fixed walls, demons, goals, portals, and boundary pistons, then set temperature, capacity, and each face's edge property. The layer selector edits inventory inside any piston, including nested pistons. Project JSON preserves the complete room definitions and test cases. Editing and testing leave gameplay progress separate.

Play mode uses the game's movement and room-session functions. It records manual operations, supports undo and redo, and retains completed rooms for inspection. A timeline exposes every movement and heat frame. Operation sequences accept `U D L R`, arrows, repetition such as `R3`, and `RESET ENTER EXIT HINT UNDO REDO`. `E(room-id)` selects a specific portal. Replay steps include blocked operations; game move counts only include accepted movement.

Checks use `{ "step": 1, "path": "players.0.temperature", "equals": 0 }`. Step zero checks the initial state. Paths address the displayed state, including `accepted`, `cells`, `players`, `pistons`, `bodies`, and intermediate `frames`. Cells sort by key and pistons by baseKey. Recording a settled result creates a full set of checks for that replay step. Exported projects can run without the browser:

```powershell
npm run test:replay
npm run test:replay -- "D:\experiments\maxwell-project.json"
```

The default suite includes seven mechanism fixtures and recorded routes for [1-1](https://www.youtube.com/watch?v=gKuCMkj5w04) and [1-2](https://www.youtube.com/watch?v=u9gbDcNc3Qw), published by Locke's Game Library. Mechanism fixtures cover adhesion, wall collisions, retentive reset, transient overheating, push-before-entry, advancing piston storage, and nested cavity access. The editor can add missing mechanism fixtures to an existing draft while preserving its edited layouts and cases. The latter video checks overheating, reset, and completion. A failed checkpoint reports its step, property path, expected value, and actual value; the command exits with a nonzero status. Original room data stays in the local imported catalogue.

## Implemented scope

- The full hierarchy includes the entrance hall, overworld, worlds 1–9, A, and B, with 322 main and nested rooms, 177 extra and meta rooms, and 641 hint scenes (1,153 imported scenes).
- Atomic grid movement, welded multi-cell rigid bodies, fixed anchors, heat conduction, partial insulation, outside temperature, demon heat conduction, goal validation, portal transformations.
- Unpaired absent edges facing the board expose adhesive faces. Reciprocal absent edges preserve structural welds; absent external load edges couple to exposed piston housing faces. Saved scene layouts and reset baselines normalize exposed edges on restoration.
- Eight independent laboratory scenes cover materials, transparent conduction, adhesive bodies, anchored thermal pistons, transient overheating, demon poses, simultaneous movement, and retentive temperatures. Laboratories do not count toward world completion.
- Each demon has a matte spherical body matching the block width, with line horns, wings, a tail, and vertical eyes. Overheating changes the eyes to crosses and preserves the standing height and orientation. Thinking uses horizontal eyes. Its body changes color with temperature. Facial features face the camera in both camera modes, including after panning. The camera follows the ground-plane center of all demons, including frozen ones, at a constant height. Large maps use a bounded local view. Free view allows rotation and panning; level resets preserve the camera. Fixed bodies mark contour corners with metal fasteners. Boundary walls extend into a flat exterior plain and only mark contour turns inside the level. Overheating appears in an inline status. Exiting a hint initializes its source scene; undo restores the pre-hint state. Piston turns display movement and heat phases before presenting the final state. Undo and reset can interrupt this playback.
- Anchored laboratory pistons expand when hot, retract when cold, and gain heat when manually compressed. Expansion can push cells and demons. Completion and movement locks are evaluated after automatic thermal actions settle.
- World maps and room annotations use localized explanations from the installation. Canonical entrances display local identifiers such as `1`; shortcuts display full identifiers such as `3-1`. Ordinary numbers and extra letters continue through nested rooms within each world. Hint chains attach to their source identifier with a colon and numeric subscripts; colon-separated segments use separate lines. Meta branches use global Greek-letter families and subscripted variants. The level list, room badge, hover text, and entrance labels share these identifiers. Labels and actuator numbers use black ink, with heavier lettering on canonical entrances. Capacity blocks display their numeric heat capacity. Compressed boundary pistons expose their cavity; nested objects appear inside their housing. Movable plates, rails, and inward/outward arrows show compression or expansion. A filled arrow indicates inventory. Hovering a housing displays its contents recursively, including temperatures, transparent blocks, portals, and demons. The number overlay displays the original actuator order.
- Room layouts persist until an exit. Each transition establishes a reset baseline. Shortcuts require discovery and use the canonical parent path for exits. An exit initializes room blocks from their level definitions, including retentive blocks, emits demons on their recorded entry sides, and sets the parent outside temperature to neutral. Multiple accessible entrances to the same room combine their temperatures and entry sides. Transitions leave an unsettled state without performing heat balance or thermal actuation. Spawn collisions destroy blocks and expose adhesive faces on broken welds. Directly selected rooms retain a canonical exit chain.
- Multiple demons move in one turn, push shared rigid bodies once, and keep separate thermal states. Entry from several sides emits several demons on exit. Non-entering demons remain in their room. Completion returns to the parent after the final movement animation settles.
- Permanent floor markers show every demon spawn coordinate from the level definition, including in rooms with multiple demons. Movement and pushing keep the standing height constant. Re-entry to the same room preserves the camera angle and zoom; free view also preserves its position.
- Boundary pistons occupy one grid position and contain an independent inventory when compressed. Hot housings expand and cold housings retract. Loads can move relative to a stationary housing, or a movable housing can move relative to a stationary load. Passive compression generates heat and passive extension generates cold in neutral heat-storing housings. Transparent housings generate neither. Internal side walls insulate; the moving face has its own thermal and mechanical connections. An interior demon exits through the opening and cannot push the housing from inside. An external welded load can move the housing when it presses against an inner wall. Housing movement carries nested inventories and attached loads.
- Opening-side movement tries rigid-body translation before cavity entry or passive compression. Blocked pushes discard their entire tentative plan. Aligned nested openings admit a demon to the first available cavity; containing side walls and occupied solid loads block entry. An expanded housing can advance around a supported movable load and compress, including loads attached to its moving face. Fixed bodies remain outside. Passive compression heats a neutral opaque housing during the motion phase, before heat balance and subsequent thermal actuation.
- Thermal actuators, including contained pistons, settle in increasing number order. Nested inventories can leave aligned openings through multiple containing layers; a containing side wall blocks that path. Passive compression follows the shortest support path among competing candidates. Moving loads into compressed housings requires a supported load or housing; unsupported pairs translate together. A turn retains every motion and heat frame. Completion and fake death are evaluated after settling. Repeated states terminate as a cycle and remain undoable. Automatic completion waits for movement to finish and records a separate exit in undo history.
- Structurally welded fixed walls at the scene perimeter form an infinite thermal reservoir at the outside temperature. Adhesive loads retain finite heat capacity, and insulation still blocks conduction. Boundary cores and the exterior plain use one extruded surface with rounded inner contours and a common temperature. Cutout adhesive coatings write depth while leaving their clear squares open.
- The fourth temperature propagates through neutral heat balances. Retentive objects preserve their temperature, coordinate, and actuator state across resets. Their current depth determines occupancy priority. Equal-depth occupants suppress initial objects; compressed housings at a shallower depth can contain restored or retained deeper objects. Reset rebuilds container references from surviving depth occupancy, collapses missing container layers, and places an object on the grid when no containing housing remains.

Ordinary movement settles visually within 110 ms. Automatic turn playback samples at most six presentation frames within 140 ms while retaining all simulation frames. Holding Ctrl displays every motion and heat frame; releasing it resumes fast playback. One buffered direction can follow the current turn. Unchanged bodies retain their geometry when another body actuates or their temperatures equalize. Portal availability builds one contact graph per query. Persistence omits presentation frames and serializes the current session without cloning it. Glass decorations render after transmission and stay outside the glass refraction buffer. Insulating faces remain opaque and occlude transmitted views from both sides; the glass core leaves depth writes to opaque surfaces. Compressed housings can contain movable supported loads, while fixed bodies block housing movement. Thinking follows each demon's awake flag; hint-scene demons start awake.

Laboratory pistons retain their separate anchored housing and single-head model. World 4 rooms 1–10 and 12–19, and original 8-01, have verified completion routes in the simulation. All main piston rooms are checked for occupancy and container invariants after opening moves. The complete puzzle set and exact mechanical stability graph have not been validated against original gameplay; difficult actuator combinations can differ. Mechanics use local level data, built-in explanations, and static analysis of the executable. See [mechanics reference](docs/mechanics.md) for the confirmed call paths.

## Development

```powershell
npm test
npm run build
npm run preview
```

`src/engine.ts` contains pure grid and heat simulation. `src/topology.ts` describes layered occupancy and surface contacts. `src/boundary-pistons.ts` plans inventory and movable-boundary motion; `src/pistons.ts` settles thermal actions and supports laboratory actuators. `src/body-geometry.ts` constructs continuous body surfaces and side coatings. `src/scene.ts` renders the state without deciding movement. `src/inspection.ts` derives hover descriptions and nested inventory lists. `src/session.ts` handles room caches, canonical entries, and resets. `src/main.ts` handles history, local persistence, phase playback, and controls. `scripts/mxw.mjs` decodes the grid stream; `scripts/import-levels.mjs` imports the full hierarchy.

MXW block flags use bit 0 for fixed anchors, bit 1 for heat storage, and bits 2–3 for temperature. Tag 5 adds a little-endian 16-bit heat capacity after these properties. Two-bit edge codes are ordered west, south, east, north: absent/welded, conducting, insulated, sticky. Heat transfer evaluates connected components simultaneously and weights finite temperatures by capacity; demons and transparent blocks contribute zero to the heat balance.

MXW piston records contain tag 4, a state/orientation byte, block properties, and an order byte. State bit 0 marks expansion; the orientation pairs map north, east, south, west. A compressed record includes one recursive inventory object. An expanded record has no inventory payload. Flattened cells keep stable keys and explicit parent-container references.
