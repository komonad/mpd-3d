# Mechanics reference

The Steam executable uses MSVC C++ objects and OpenSiv3D 0.6.15. The inspected executable has SHA-256 `c6a11a50619d1a1d12cd396d87b79fd5eb2d2f82fd5db6d79c25ad45b666d5dd` and PE image base `0x140000000`. Addresses below are virtual addresses for that binary. Function roles are inferred from RTTI, virtual calls, field access, and caller relationships. No original executable or generated decompilation is distributed with this project.

## Temperature and thinking

`0x14006f140` builds thermal moves from connected components. `0x14006ffe0` computes the resulting temperature. The exterior component takes its temperature directly from the outside object. Finite components sum hot capacity minus cold capacity; a positive sum produces hot, a negative sum cold, and a zero sum produces the fourth temperature when any heat capacity retains it. Transparent objects and demons contribute zero capacity. Block serialization at `0x14005cc50` emits tag 5 when capacity at offset `0x120` exceeds one, followed by the ordinary properties and a 16-bit capacity.

Native temperature values are neutral `0`, hot `1`, cold `2`, retentive `3`. The simulator uses `0`, `1`, `-1`, `2`, respectively.

A finite component with no heat capacity balances to neutral. Demon temperature does not contribute retentive capacity to that balance. In the [updated 9-14 walkthrough](https://www.bilibili.com/video/BV1QugJ6PEMQ/), the demon is retentive at `(2, 2)` beside the retentive block and neutral after moving left to `(1, 2)`.

The player has temperature at offset `0xe0` and an independent `awake` flag at `0xe8`. `0x140049e30` clones hint-entering demons with `awake = false`. Physical movement and portal entry exclude sleeping demons. `0x14006f140` marks a sleeping demon to wake when a temperature change makes it hot; `Move::Thermal::execute` at `0x140089ea0` applies that flag. Drawing at `0x14007f890` uses crosses for hot eyes, horizontal lines for sleeping eyes, and vertical lines for awake eyes.

## Reset and transitions

The reset-step builder at `0x1400702d0` compares the current field with the initial field. Retentive objects retain their current state. Other objects return to the baseline, subject to layer occupancy. The baseline belongs to the most recent transition into the room. Reset does not perform a thermal turn. The insertion helper at `0x140072940` admits retained objects before initial objects into a map of coordinates and depths. A non-container object blocks candidates at deeper layers and cannot be inserted above an occupied deeper layer. Compressed pistons permit nested occupancy. Construction walks surviving objects in depth order: the first becomes an on-grid object and each following object belongs to the preceding compressed piston. Missing layers collapse; an orphaned retained inventory keeps its coordinate and becomes an on-grid object.

Entry enumerates accessible entrances, selects a target hierarchy, gathers demons and entry sides, and computes the outside temperature from entrance temperatures. The relevant entry path begins at `0x1400497e0`. Cached rooms inherit their layout through `0x14004e440`, which clones the field and spawns demons. Spawn collisions destroy the occupying object.

Exit uses the fresh-field construction path at `0x14005a390` / `0x14004c9b0`, including current completion properties for entrances. Initialization differs from retentive reset: blocks reload from the level definition. Remaining demons are carried into the initialized parent and returning demons emerge along recorded sides. The parent outside temperature is neutral. Hint exit returns to the original room's starting point; undo can restore the state before hint entry.

Transition states can contain unbalanced temperatures and immediately actionable pistons. They do not settle until a physical turn. The `transient` field records this unsettled phase in the simulator; it does not suppress the heat phase of the following movement.

## Labels and pistons

Entrance label construction at `0x1400582d0` selects the display mode in `0x14005b290`. Canonical entrances use the local identifier; shortcuts include the world identifier. The allocator at `0x1400593d0` shares ordinary-number and extra-letter counters across nested rooms within each world. A nested room consumes the next number rather than appending a hierarchy segment: `b32c8c9c` is `3-12`, and `9334fa16` is `3-13`. World nodes reset these counters. Hint chains attach to their source label with a colon and share a subscript counter. Meta branches use a global Greek-letter counter with numbered variants (`0-α`, `0-α₂`), rendered through `0x14005b780`. The tree loader at `0x140058d20` traverses meta, normal, extra, and hint children in that order. `0x140057ef0` splits colon-separated labels into lines and uses heavier lettering for canonical entrances.

Piston RTTI exposes a block-property object, an expansion flag at `0xf8`, and an optional contained object at `0x100`. On-grid and in-piston positions are separate native position classes. Piston motion is a relative change between housing and load, with explicit support checks. Active actions follow piston order; passive actions follow mechanical support. The native planner at `0x14006a680` constructs and resolves a dependency graph. The simulator's support-distance planner covers common chains; parity of every branched or cyclic graph remains unverified.

Ordinary pushes attempt translation of the complete loaded body before relative piston motion. Cold actuation reserves the housing while pulling its load; if that pull is blocked, the advancing housing reserves the supported load while storing it. A compressed housing can retreat from supported inventory and extend. Hot expansion keeps contained inventory attached during retreat planning, then exposes it when applying the completed plan. This preserves layered occupancy and the housing's external body connections during dependency lookup. Compound motion treats the pushing demon's source address and the source addresses of dependent moving bodies as vacated. Other active demons can vacate a translating body's destinations as part of the same input. Each demon moves once per turn. Sleeping or overheated demons cannot walk themselves or be displaced by direct demon contact. Translating blocks and thermal actuators can displace them mechanically.

An absent edge on an external opaque load joins an exposed housing face along the piston axis, including the back face of a compressed housing. Expansion state and thermal coating do not remove this external mechanical connection. The compressed opening exposes inventory rather than a solid housing face.

An absent external face joins a transparent neighbor after translation. The connection also applies when the transparent object owns the absent face, including contact with an insulating fixed wall. In 9-22, the cold opaque load carries the transparent goal block upward as one body; the load's absent lower face retains its surface code. In 9-18, the transparent pair remains anchored beside the lower housing.

Passive piston exchanges change temperature independently of heat capacity. The native exchange constructor at `0x14003cac0` maps compression from cold to neutral and all other temperatures to hot. Expansion maps hot to neutral and all other temperatures to cold. A retentive housing can therefore lose its reset retention through passive motion. Transparent housings receive the motion-phase temperature, then contribute zero capacity to the next thermal balance.

A supported expanded housing can absorb an opening-side load with an absent rear face during a perpendicular push when rigid translation is blocked. An adhesive rear face does not permit this lateral compression. The simulator checks rear support, reserves the housing, and plans the load along the compression axis. A subsequent hot expansion can displace the pushing demon along that axis. These conditions are inferred from the 9-18 and 9-19 walkthroughs; equivalence for other dependency arrangements remains unverified.

Released piston inventories expose unpaired absent edges as adhesive faces before heat balance and subsequent actuation. Their insulating faces retain their edge codes. Ordinary rigid-body translation preserves its existing surface codes.

Active extension evaluates the final relative position of the housing and its inventory. If a dependency translates both to the same on-grid address, the inventory remains contained and the housing remains compressed. Such carriage does not spend an expansion impulse. A following heat phase can continue the thermal dependency chain. In 9-24, the final rightward push leaves the demon stationary while chained actuations carry the housings across the passage and place the third housing on the goal.

## Validation boundaries

Local tests cover MXW parsing, finite and infinite heat capacity, multiple demons, nested inventories, retentive resets at multiple depths, supported piston motion, transitions, and label data. Completion routes cover all numbered rooms in worlds 1–3, world 4 rooms 1–10 and 12–19, and selected later rooms. Opening-move checks cover every main room with pistons. Browser checks cover the overworld, worlds 1–9, A, B, hints, undo after automatic exit, hover inventory, free camera orientation, and layout at desktop and mobile sizes.

World 4 reference tests compare intermediate states with [the numbered-room walkthrough](https://www.bilibili.com/video/BV1Znt3z1EwU/) and [the updated 4-12 walkthrough](https://www.bilibili.com/video/BV1YtnuzmEuG/). Operation indices refer to the saved catalogue routes, including undo operations.

| Room | Video time | Operation | Checkpoint |
| --- | --- | --- | --- |
| 4-10 | 218.47 s | 48 | Cold housing advances around a supported L-shaped load and contains its lower cell. |
| 4-12 | 13.23 s | 58 | A concave transparent frame occupies the demon's source tile during a rightward push. |
| 4-15 | 404.17 s | 53 | The loaded housing translates with its surrounding concave body. |
| 4-16 | 417.60 s | 22 | The housing retreats from supported inventory; the heat frame precedes automatic retraction. |
| 4-17 | 435.37 s | 41 | Cold actuation stores the load without translating the free housing. |

World 9 reference tests compare [the 9-5 and 9-6 walkthrough](https://www.bilibili.com/video/BV1fVL9zTEXV/), [the updated 9-11 walkthrough](https://www.bilibili.com/video/BV1ewbW6cEx7/), [the updated 9-14 walkthrough](https://www.bilibili.com/video/BV1QugJ6PEMQ/), [the 9-17 opening walkthrough](https://www.bilibili.com/video/BV19vLUzmEGP/), [the 9-13–9-17 walkthrough](https://www.bilibili.com/video/BV1gso2YaE5L/), [the 9-18–9-21 walkthrough](https://www.bilibili.com/video/BV1L6ZcYmEfc/), and [the numbered-room walkthrough](https://www.bilibili.com/video/BV1mRtQzyEK4/).

| Room | Video time | Checkpoint |
| --- | --- | --- |
| 9-5 | 28.60 s | The movable entrance advances right and mechanically displaces the overheated demon ahead of it. |
| 9-11 | 15.23 s | An upward push moves the transparent frame and its attached compressed housing together. |
| 9-14 | 2.67 s | Moving left from the retentive block leaves the demon at `(1, 2)` with neutral temperature. |
| 9-15 | 398.10 s | A blocked opening-side push compresses and reheats the retentive housing; automatic extension leaves it neutral, so reset restores it while retaining the demon. |
| 9-17 | 6.53 s | Both demons and their enclosing frame advance right in one input. |
| 9-17 | 436.90 s | The retained block reaches `(12, 7)` at neutral temperature while the housing remains compressed at `(9, 4)` and both demons remain active. |
| 9-18 | 137.20–146.80 s | The retentive demon remains inside the blocked housing at `(8, 4)`. Reset restores the housing elsewhere while retaining the demon at its current coordinate. |
| 9-19 | 293.80–294.80 s | Lateral compression and expansion clear the demon's passage while the glass remains at `(8, 4)` above the expanded housing at `(8, 5)`; the neutral block reaches `(10, 1)`. Intermediate native housing temperatures remain unverified. |
| 9-20 | 431.70–432.71 s | Reset restores the retained compressed housings before the final rightward push and thermal cascade place the first housing at `(16, 5)`. |
| 9-22 | 726.57 s | An upward push carries the transparent goal block together with the cold load above it. |
| 9-24 | 888.97 s | The final rightward push starts a chain of thermal actions; every phase preserves inventory layers and the demon's position. |
| 9-25 | 912.37 s | The final turn places the retained solid load on the goal and leaves both surviving housings expanded. |

These checks validate the simulator's contracts and selected original puzzles. They do not constitute exhaustive differential testing against the executable.
