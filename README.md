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
| Hint | H |
| Rotate / zoom camera | Right drag / wheel |

Progress, discovered shortcuts, cached room states, and entry baselines are saved in browser local storage. The world selector opens the next supported world after its predecessor's map or all main puzzles are completed. The level browser provides direct access to puzzles within unlocked worlds. World-map entrances transform when their corresponding levels are completed. Undo includes resets, scene transitions, and completion progress within the current browser session.

## Implemented scope

- World 1: 20 main puzzles, 7 extra puzzles, world map, and hint scenes (65 imported scenes).
- Atomic grid movement, welded multi-cell rigid bodies, fixed anchors, heat conduction, partial insulation, outside temperature, demon heat conduction, goal validation, portal transformations.
- Eight independent laboratory scenes cover materials, transparent conduction, adhesive bodies, anchored thermal pistons, transient overheating, demon poses, simultaneous movement, and retentive temperatures. Laboratories do not count toward world completion.
- Each demon has a matte spherical body matching the block width, with horns, eyes, a line mouth, limbs, and a tail. Its body changes color with temperature. Facial features face the camera. The camera follows the center of all demons, including frozen ones. Fixed bodies mark every contour corner with metal fasteners. Overheating produces a collapsed pose; idle thought and movement have separate animations. Piston turns display movement and heat phases before presenting the final state. Undo and reset can interrupt this playback.
- Anchored laboratory pistons expand when hot, retract when cold, and gain heat when manually compressed. Expansion can push cells and demons. Completion and movement locks are evaluated after automatic thermal actions settle.
- Worlds 2 and 3: complete maps, main and extra puzzles, nested rooms, and localized hint scenes. The catalogue contains 227 scenes across the first three worlds.
- Room layouts persist until an exit. Each entry updates the reset baseline. Shortcuts require discovery and use the canonical parent path for exits. An exit resets all entered rooms, emits demons on their recorded entry sides, and sets the parent outside temperature to neutral. Entering inherits the portal temperature as the child's outside reservoir. Transitions do not perform heat balance. Spawn collisions destroy blocks and expose adhesive faces on broken welds.
- Multiple demons move in one turn, push shared rigid bodies once, and keep separate thermal states. Entry from several sides emits several demons on exit. Non-entering demons remain in their room. Completion automatically returns to the parent.
- The fourth temperature propagates through neutral heat balances. Retentive objects preserve their state across resets; occupied initial positions suppress other objects until they become free.

Worlds 4–9 remain locked while the original movable-boundary piston model, inventories, nested depth, and mechanical priorities are integrated. Laboratory pistons use an anchored housing and a single head. Cross-world meta puzzles and the outer hub are outside the playable catalogue. Mechanics are reconstructed from local level data and the game's built-in explanations; parity with the original executable needs further side-by-side validation.

## Development

```powershell
npm test
npm run build
npm run preview
```

`src/engine.ts` contains pure grid and heat simulation; `src/pistons.ts` settles anchored thermal actions. `src/body-geometry.ts` constructs continuous body surfaces and side coatings. `src/scene.ts` renders the state without deciding movement. `src/session.ts` handles room caches, canonical entries, resets, and world progression. `src/main.ts` handles history, local persistence, phase playback, and controls. `scripts/mxw.mjs` decodes the grid stream; `scripts/import-levels.mjs` selects supported worlds from the hierarchy.

MXW block flags use bit 0 for fixed anchors, bit 1 for heat storage, and bits 2–3 for temperature. Two-bit edge codes are ordered west, south, east, north: absent/welded, conducting, insulated, sticky. Heat transfer evaluates connected components simultaneously; demons and transparent blocks contribute zero to the heat balance.
