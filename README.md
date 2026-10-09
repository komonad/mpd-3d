# Maxwell · 3D

A local Three.js adaptation of Maxwell's puzzling demon. All grid blocks use cubic dimensions. Rigid bodies have continuous surfaces, including concave outlines and holes. PBR materials distinguish matte housings, coated blocks, polished metal, and transmitting glass. Insulation and adhesive layers cover vertical faces and expose their cross-sections on top. Adhesive layers use six checker cells across each grid face. Clear squares expose the underlying surface; solid squares follow the local temperature color. The pattern follows continuous contours and rounded corner joints. Glass has a clear refracting body and thin exterior rims. The renderer combines supersampling, multisampling, SMAA, board-fitted shadows, and ambient occlusion. Postprocessing targets match the canvas drawing buffer in physical pixels, including fractional display densities. Surface layers batch their faces by material.

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

The importer reads the installation without changing it. The generated `public/levels.local.json` contains local game data and is excluded from Git. Original level design and game assets belong to muratsubo Games. No original executable, music, or textures are included in the source project.

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

Progress, discovered shortcuts, cached room states, and entry baselines are saved in browser local storage. The world selector provides direct access to the overworld, worlds 1–9, A, and B without changing completion progress. The overworld button opens the original outer map; canonical exits connect world maps to that map and its entrance hall. Saved rooms acquire missing outer parents without changing their current layout. World-map entrances transform when their corresponding levels are completed. Undo includes resets, scene transitions, and completion progress within the current browser session. The header, scene, controls, and footer occupy separate layout rows; only the level list scrolls within the sidebar. Fullscreen play expands the game area and preserves its controls and camera.

## Implemented scope

- The full hierarchy includes the entrance hall, overworld, worlds 1–9, A, and B, with 322 main and nested rooms, 177 extra and meta rooms, and 641 hint scenes (1,153 imported scenes).
- Atomic grid movement, welded multi-cell rigid bodies, fixed anchors, heat conduction, partial insulation, outside temperature, demon heat conduction, goal validation, portal transformations.
- Eight independent laboratory scenes cover materials, transparent conduction, adhesive bodies, anchored thermal pistons, transient overheating, demon poses, simultaneous movement, and retentive temperatures. Laboratories do not count toward world completion.
- Each demon has a matte spherical body matching the block width, with line horns, wings, a tail, and vertical eyes. Overheating changes the eyes to crosses and preserves the standing height and orientation. Thinking uses horizontal eyes. Its body changes color with temperature. Facial features face the camera in both camera modes, including after panning. The camera follows the ground-plane center of all demons, including frozen ones, at a constant height. Large maps use a bounded local view. Free view allows rotation and panning; level resets preserve the camera. Fixed bodies mark contour corners with metal fasteners. Boundary walls extend into a flat exterior plain and only mark contour turns inside the level. Overheating appears in an inline status. Exiting a hint initializes its source scene; undo restores the pre-hint state. Piston turns display movement and heat phases before presenting the final state. Undo and reset can interrupt this playback.
- Anchored laboratory pistons expand when hot, retract when cold, and gain heat when manually compressed. Expansion can push cells and demons. Completion and movement locks are evaluated after automatic thermal actions settle.
- World maps and room annotations use localized explanations from the installation. Canonical entrances display local identifiers such as `1`; shortcuts display full identifiers such as `3-1`. Nested identifiers use separate lines for each colon-separated layer. Labels and actuator numbers use black ink, with heavier lettering on canonical entrances. Capacity blocks display their numeric heat capacity. Compressed boundary pistons expose their cavity; nested objects appear inside their housing. Movable plates, rails, and inward/outward arrows show compression or expansion. A filled arrow indicates inventory. Hovering a housing displays its contents recursively, including temperatures, transparent blocks, portals, and demons. The number overlay displays the original actuator order.
- Room layouts persist until an exit. Each transition establishes a reset baseline. Shortcuts require discovery and use the canonical parent path for exits. An exit initializes room blocks from their level definitions, including retentive blocks, emits demons on their recorded entry sides, and sets the parent outside temperature to neutral. Multiple accessible entrances to the same room combine their temperatures and entry sides. Transitions leave an unsettled state without performing heat balance or thermal actuation. Spawn collisions destroy blocks and expose adhesive faces on broken welds. Directly selected rooms retain a canonical exit chain.
- Multiple demons move in one turn, push shared rigid bodies once, and keep separate thermal states. Entry from several sides emits several demons on exit. Non-entering demons remain in their room. Completion returns to the parent after the final movement animation settles.
- Boundary pistons occupy one grid position and contain an independent inventory when compressed. Hot housings expand and cold housings retract. Loads can move relative to a stationary housing, or a movable housing can move relative to a stationary load. Passive compression generates heat and passive extension generates cold in neutral heat-storing housings. Transparent housings generate neither. Internal side walls insulate; the moving face has its own thermal and mechanical connections. An interior demon exits through the opening and cannot push the housing from inside. An external welded load can move the housing when it presses against an inner wall. Housing movement carries nested inventories and attached loads.
- Thermal actuators, including contained pistons, settle in increasing number order. Nested inventories can leave aligned openings through multiple containing layers; a containing side wall blocks that path. Passive compression follows the shortest support path among competing candidates. Moving loads into compressed housings requires a supported load or housing; unsupported pairs translate together. A turn retains every motion and heat frame. Completion and fake death are evaluated after settling. Repeated states terminate as a cycle and remain undoable. Automatic completion waits for movement to finish and records a separate exit in undo history.
- Structurally welded fixed walls at the scene perimeter form an infinite thermal reservoir at the outside temperature. Adhesive loads retain finite heat capacity, and insulation still blocks conduction. Boundary cores and the exterior plain use one extruded surface with rounded inner contours and a common temperature. Cutout adhesive coatings write depth while leaving their clear squares open.
- The fourth temperature propagates through neutral heat balances. Retentive objects preserve their temperature, coordinate, and actuator state across resets. Their current depth determines occupancy priority. Equal-depth occupants suppress initial objects; compressed housings at a shallower depth can contain restored or retained deeper objects. Reset rebuilds container references from surviving depth occupancy, collapses missing container layers, and places an object on the grid when no containing housing remains.

Ordinary movement settles visually within 110 ms. Automatic turn playback samples at most six presentation frames within 140 ms while retaining all simulation frames. Holding Ctrl displays every motion and heat frame; releasing it resumes fast playback. One buffered direction can follow the current turn. Unchanged bodies retain their geometry when another body actuates or their temperatures equalize. Portal availability builds one contact graph per query. Persistence omits presentation frames and serializes the current session without cloning it. Glass attachments render after transmission and stay outside the glass refraction buffer. Thinking follows each demon's awake flag; hint-scene demons start awake.

Laboratory pistons retain their separate anchored housing and single-head model. Original 4-01, 4-02, and 8-01 have verified completion routes in the simulation. All main piston rooms are checked for occupancy and container invariants after opening moves. The complete puzzle set and exact mechanical stability graph have not been validated against original gameplay; difficult actuator combinations can differ. Mechanics use local level data, built-in explanations, and static analysis of the executable. See [mechanics reference](docs/mechanics.md) for the confirmed call paths.

## Development

```powershell
npm test
npm run build
npm run preview
```

`src/engine.ts` contains pure grid and heat simulation. `src/topology.ts` describes layered occupancy and surface contacts. `src/boundary-pistons.ts` plans inventory and movable-boundary motion; `src/pistons.ts` settles thermal actions and supports laboratory actuators. `src/body-geometry.ts` constructs continuous body surfaces and side coatings. `src/scene.ts` renders the state without deciding movement. `src/inspection.ts` derives hover descriptions and nested inventory lists. `src/session.ts` handles room caches, canonical entries, and resets. `src/main.ts` handles history, local persistence, phase playback, and controls. `scripts/mxw.mjs` decodes the grid stream; `scripts/import-levels.mjs` imports the full hierarchy.

MXW block flags use bit 0 for fixed anchors, bit 1 for heat storage, and bits 2–3 for temperature. Tag 5 adds a little-endian 16-bit heat capacity after these properties. Two-bit edge codes are ordered west, south, east, north: absent/welded, conducting, insulated, sticky. Heat transfer evaluates connected components simultaneously and weights finite temperatures by capacity; demons and transparent blocks contribute zero to the heat balance.

MXW piston records contain tag 4, a state/orientation byte, block properties, and an order byte. State bit 0 marks expansion; the orientation pairs map north, east, south, west. A compressed record includes one recursive inventory object. An expanded record has no inventory payload. Flattened cells keep stable keys and explicit parent-container references.
