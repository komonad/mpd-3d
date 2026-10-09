# Maxwell · 3D

A local Three.js adaptation of the first world of Maxwell's puzzling demon. All grid blocks use cubic dimensions. Rigid bodies have continuous surfaces, including concave outlines and holes. PBR materials distinguish matte housings, coated blocks, polished metal, and transmitting glass. Insulation and adhesive layers cover vertical faces and expose their cross-sections on top. Adhesive layers use six checker cells across each grid face. Clear squares expose the underlying surface; solid squares follow the local temperature color. The pattern follows continuous contours and rounded corner joints. Glass has a clear refracting body and thin exterior rims. The renderer combines supersampling, multisampling, SMAA, board-fitted shadows, and ambient occlusion. Postprocessing targets match the canvas drawing buffer in physical pixels, including fractional display densities. Surface layers batch their faces by material.

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
| Pan camera | Shift + right drag |

Progress and the current scene are saved in browser local storage. The level browser provides direct access to all 27 first-world puzzles. World-map entrances transform when their corresponding levels are completed. Undo includes resets, scene transitions, and completion progress within the current browser session.

## Implemented scope

- World 1: 20 main puzzles, 7 extra puzzles, world map, and hint scenes (65 imported scenes).
- Atomic grid movement, welded multi-cell rigid bodies, fixed anchors, heat conduction, partial insulation, outside temperature, demon heat conduction, goal validation, portal transformations.
- Six independent laboratory scenes cover materials, transparent conduction, adhesive bodies, anchored thermal pistons, transient overheating, and demon poses. Laboratories do not count toward first-world completion.
- The demon has a spherical body matching the block width, with horns, eyes, limbs, and a tail. Its body and thermal core change color with temperature. Overheating produces a collapsed pose; idle thought and movement have separate animations. Piston turns display movement and heat phases before presenting the final state. Undo and reset can interrupt this playback.
- Anchored laboratory pistons expand when hot, retract when cold, and gain heat when manually compressed. Expansion can push cells and demons. Completion and movement locks are evaluated after automatic thermal actions settle.
- A level exit resets the parent layout and emits the demon in its entry direction. Entering a portal inherits its temperature as the child's outside reservoir.

Worlds 2–9, original piston level import, movable and nested pistons, piston inventories, indirect compression, the fourth temperature, multiple-demon rendering, recursive shortcut traversal, and cross-world meta puzzles are outside the playable scope. The importer rejects unsupported tile types rather than approximating them. Laboratory pistons use an anchored housing and a single head. Mechanics are reconstructed from local level data and the game's built-in explanations; parity with the original executable needs further side-by-side validation.

## Development

```powershell
npm test
npm run build
npm run preview
```

`src/engine.ts` contains pure grid and heat simulation; `src/pistons.ts` settles anchored thermal actions. `src/body-geometry.ts` constructs continuous body surfaces and side coatings. `src/scene.ts` renders the state without deciding movement. `src/main.ts` handles navigation, history, local persistence, phase playback, and controls. `scripts/mxw.mjs` decodes the grid stream; `scripts/import-levels.mjs` selects the first world from the hierarchy.

MXW block flags use bit 0 for fixed anchors, bit 1 for heat storage, and bits 2–3 for temperature. Two-bit edge codes are ordered west, south, east, north: absent/welded, conducting, insulated, sticky. Heat transfer evaluates connected components simultaneously; demons and transparent blocks contribute zero to the heat balance.
