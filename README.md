# Maxwell · 3D

A local Three.js adaptation of the first world of Maxwell's puzzling demon. The renderer uses ceramic and metal PBR materials, procedural surface grain, an orthographic camera, shadows, ambient occlusion, and bloom.

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
- A level exit resets the parent layout and emits the demon in its entry direction. Entering a portal inherits its temperature as the child's outside reservoir.

Worlds 2–9, pistons, the fourth temperature, multiple demons, recursive shortcut traversal, and cross-world meta puzzles are outside the playable scope. The importer rejects unsupported tile types rather than approximating them. Mechanics are reconstructed from local level data and the game's built-in explanations; parity with the original executable needs further side-by-side validation.

## Development

```powershell
npm test
npm run build
npm run preview
```

`src/engine.ts` contains pure grid and heat simulation. `src/scene.ts` renders the state without deciding movement. `src/main.ts` handles navigation, history, local persistence, and controls. `scripts/mxw.mjs` decodes the grid stream; `scripts/import-levels.mjs` selects the first world from the hierarchy.

MXW block flags use bit 0 for fixed anchors, bit 1 for heat storage, and bits 2–3 for temperature. Two-bit edge codes are ordered west, south, east, north: absent/welded, conducting, insulated, sticky. Heat transfer evaluates connected components simultaneously; demons and transparent blocks contribute zero to the heat balance.
