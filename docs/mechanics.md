# Mechanics reference

The Steam executable uses MSVC C++ objects and OpenSiv3D 0.6.15. The inspected executable has SHA-256 `c6a11a50619d1a1d12cd396d87b79fd5eb2d2f82fd5db6d79c25ad45b666d5dd` and PE image base `0x140000000`. Addresses below are virtual addresses for that binary. Function roles are inferred from RTTI, virtual calls, field access, and caller relationships. No original executable or generated decompilation is distributed with this project.

## Temperature and thinking

`0x14006f140` builds thermal moves from connected components. `0x14006ffe0` computes the resulting temperature. The exterior component takes its temperature directly from the outside object. Finite components sum hot capacity minus cold capacity; a positive sum produces hot, a negative sum cold, and a zero sum produces the fourth temperature when any heat capacity retains it. Transparent objects and demons contribute zero capacity. Block serialization at `0x14005cc50` emits tag 5 when capacity at offset `0x120` exceeds one, followed by the ordinary properties and a 16-bit capacity.

Native temperature values are neutral `0`, hot `1`, cold `2`, retentive `3`. The simulator uses `0`, `1`, `-1`, `2`, respectively.

The player has temperature at offset `0xe0` and an independent `awake` flag at `0xe8`. `0x140049e30` clones hint-entering demons with `awake = false`. Physical movement and portal entry exclude sleeping demons. `0x14006f140` marks a sleeping demon to wake when a temperature change makes it hot; `Move::Thermal::execute` at `0x140089ea0` applies that flag. Drawing at `0x14007f890` uses crosses for hot eyes, horizontal lines for sleeping eyes, and vertical lines for awake eyes.

## Reset and transitions

The reset-step builder at `0x1400702d0` compares the current field with the initial field. Retentive objects retain their current state. Other objects return to the baseline, subject to layer occupancy. The baseline belongs to the most recent transition into the room. Reset does not perform a thermal turn. The insertion helper at `0x140072940` admits retained objects before initial objects into a map of coordinates and depths. A non-container object blocks candidates at deeper layers and cannot be inserted above an occupied deeper layer. Compressed pistons permit nested occupancy. Construction walks surviving objects in depth order: the first becomes an on-grid object and each following object belongs to the preceding compressed piston. Missing layers collapse; an orphaned retained inventory keeps its coordinate and becomes an on-grid object.

Entry enumerates accessible entrances, selects a target hierarchy, gathers demons and entry sides, and computes the outside temperature from entrance temperatures. The relevant entry path begins at `0x1400497e0`. Cached rooms inherit their layout through `0x14004e440`, which clones the field and spawns demons. Spawn collisions destroy the occupying object.

Exit uses the fresh-field construction path at `0x14005a390` / `0x14004c9b0`, including current completion properties for entrances. Initialization differs from retentive reset: blocks reload from the level definition. Remaining demons are carried into the initialized parent and returning demons emerge along recorded sides. The parent outside temperature is neutral. Hint exit returns to the original room's starting point; undo can restore the state before hint entry.

Transition states can contain unbalanced temperatures and immediately actionable pistons. They do not settle until a physical turn. The `transient` field records this unsettled phase in the simulator; it does not suppress the heat phase of the following movement.

## Labels and pistons

Entrance label construction at `0x1400582d0` selects the display mode in `0x14005b290`. Canonical entrances use the local identifier, shortcuts use the full hierarchy. Main levels use ordinary numbers without leading zeroes, extra levels use letters, worlds use `w`, and deeper levels use colons. `0x140057ef0` splits the hierarchy on colons and draws separate lines, using heavier lettering for canonical entrances. Hint numbering uses `?` followed by numeric subscripts. Meta-level labels use Greek letters through `0x14005b780`.

Piston RTTI exposes a block-property object, an expansion flag at `0xf8`, and an optional contained object at `0x100`. On-grid and in-piston positions are separate native position classes. Piston motion is a relative change between housing and load, with explicit support checks. Active actions follow piston order; passive actions follow mechanical support. The native planner at `0x14006a680` constructs and resolves a dependency graph. The simulator's support-distance planner covers common chains; parity of every branched or cyclic graph remains unverified.

## Validation boundaries

Local tests cover MXW parsing, finite and infinite heat capacity, multiple demons, nested inventories, retentive resets at multiple depths, supported piston motion, transitions, and label data. Completion routes cover original `2-1`, `3-1`, `4-1`, `4-2`, and `8-1`. Opening-move checks cover every main room with pistons. Browser checks cover the overworld, worlds 1–9, A, B, hints, undo after automatic exit, hover inventory, free camera orientation, and layout at desktop and mobile sizes.

These checks validate the simulator's contracts and selected original puzzles. They do not constitute exhaustive differential testing against the executable.
