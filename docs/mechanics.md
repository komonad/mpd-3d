# Mechanics reference

This document records the simulator's intended rules, selected gameplay checkpoints, and validation limits. Original level designs, puzzle structure, and gameplay mechanics come from [Maxwell's puzzling demon by muratsubo Games](https://store.steampowered.com/app/2770160/Maxwells_puzzling_demon/). This project is unofficial; see [the rights notice](../COPYRIGHT.md).

## Temperature and thinking

Heat balance evaluates connected components. The exterior component takes its temperature directly from the outside temperature. Finite components sum hot capacity minus cold capacity; a positive sum produces hot, a negative sum cold, and a zero sum produces the fourth temperature when any heat capacity retains it. Transparent objects and demons contribute zero capacity.

The simulator represents neutral, hot, cold, and retentive temperatures as `0`, `1`, `-1`, and `2`, respectively.

A finite component with no heat capacity balances to neutral. Demon temperature does not contribute retentive capacity to that balance. In the [updated 9-14 walkthrough](https://www.bilibili.com/video/BV1QugJ6PEMQ/), the demon is retentive at `(2, 2)` beside the retentive block and neutral after moving left to `(1, 2)`.

Demon temperature and wakefulness are separate states. Entering a hint leaves the source-room demon asleep; hint-scene demons start awake. Physical movement and portal entry exclude sleeping demons. Heating a sleeping demon wakes it. Hot eyes are crosses, sleeping eyes are horizontal lines, and awake eyes are vertical lines.

## Reset and transitions

Reset compares the current room with its entry baseline. Retentive objects retain their current state. Other objects return to the baseline, subject to layer occupancy. The baseline belongs to the most recent transition into the room. Reset does not perform a thermal turn. Retained objects occupy layers before baseline objects. A non-container object blocks candidates at deeper layers and cannot be inserted above an occupied deeper layer. Compressed pistons permit nested occupancy. Construction walks surviving objects in depth order: the first becomes an on-grid object and each following object belongs to the preceding compressed piston. Missing layers collapse; an orphaned retained inventory keeps its coordinate and becomes an on-grid object.

Partial restoration exposes severed compound faces. A restored cell uses its baseline connections; a retained cell uses its current connections. Cuts on existing cells and revived non-neutral cells become adhesive. Revived neutral cells expose ordinary faces. These conditions are inferred from [the 7-11 walkthrough](https://www.bilibili.com/video/BV1WH6HYzEPd/) and the selected World 9 checkpoints: the surviving left half has an adhesive right face at 16.00 s, while the revived right half has an ordinary left face at 24.00 s. Surviving absent-face pairs and connections to piston housings or transparent neighbors remain intact. Exterior faces without a former compound neighbor retain their edge codes. In 9-16, the two-cell retentive body separates through successive resets, exposing an adhesive face that later anchors the upper load to the insulating wall and blocks piston expansion. Other revival temperatures and compound arrangements require further native-state comparisons.

Entry enumerates accessible entrances, selects a target hierarchy, gathers demons and entry sides, and computes the outside temperature from entrance temperatures. Cached rooms retain their layout while receiving entering demons. Spawn collisions destroy the occupying object.

Exit initializes room blocks from their level definitions, including current completion properties for entrances. Initialization differs from retentive reset. Remaining demons are carried into the initialized parent and returning demons emerge along recorded sides. The parent outside temperature is neutral. Hint exit returns to the original room's starting point; undo can restore the state before hint entry.

Transition states can contain unbalanced temperatures and immediately actionable pistons. They do not settle until a physical turn. The `transient` field records this unsettled phase in the simulator; it does not suppress the heat phase of the following movement.

## Labels and pistons

Canonical entrances use the local identifier; shortcuts include the world identifier. Ordinary-number and extra-letter counters are shared across nested rooms within each world. A nested room consumes the next number rather than appending a hierarchy segment. World nodes reset these counters. Hint chains attach to their source label with a colon and share a subscript counter. Meta branches use a global Greek-letter counter with numbered variants (`0-α`, `0-α₂`). Traversal visits meta, normal, extra, and hint children in that order. Colon-separated labels use separate lines, and canonical entrances use heavier lettering.

A piston has housing properties, an expansion state, and an independent cavity when compressed. On-grid and contained objects occupy separate layers. Piston motion is a relative change between housing and load, with explicit support checks. Active actions follow piston order; passive actions follow mechanical support. The simulator's support-distance planner covers common chains; parity of every branched or cyclic dependency graph remains unverified.

Ordinary pushes attempt translation of the complete loaded body before relative piston motion. Cold actuation reserves the housing while pulling its load; if that pull is blocked, the advancing housing reserves the supported load while storing it. A compressed housing can retreat from supported inventory and extend. Hot expansion keeps contained inventory attached during retreat planning, then exposes it when applying the completed plan. This preserves layered occupancy and the housing's external body connections during dependency lookup. Compound motion treats the pushing demon's source address and the source addresses of dependent moving bodies as vacated. Other active demons can vacate a translating body's destinations as part of the same input. Each demon moves once per turn. Sleeping or overheated demons cannot walk themselves or be displaced by direct demon contact. Translating blocks and thermal actuators can displace them mechanically.

An absent edge on an external load joins the exposed housing face it touches, including its side faces and the back face of a compressed housing. Expansion state and thermal coating do not remove this external mechanical connection. The compressed opening exposes inventory rather than a solid housing face.

An absent external face joins a transparent neighbor after translation. The connection also applies when the transparent object owns the absent face, including contact with an insulating fixed wall. In 9-22, the cold opaque load carries the transparent goal block upward as one body after a reset exposes its conducting lower face. In 9-18, the transparent pair remains anchored beside the lower housing.

Exterior heat capacity follows the wall's intrinsic shape, identified by mutually absent face pairs. Mechanical attachment to the wall does not add objects to its infinite thermal reservoir. A transparent object attached across an insulating wall face remains in its finite thermal component.

Passive piston exchanges change temperature independently of heat capacity. Compression maps cold to neutral and all other temperatures to hot. Expansion maps hot to neutral and all other temperatures to cold. A retentive housing can therefore lose its reset retention through passive motion. Transparent housings receive the motion-phase temperature, then contribute zero capacity to the next thermal balance.

A supported expanded housing can absorb an opening-side load with an absent rear face during a perpendicular push when rigid translation is blocked. An adhesive rear face does not permit this lateral compression. The simulator checks rear support, reserves the housing, and plans the load along the compression axis. A subsequent hot expansion can displace the pushing demon along that axis. These conditions are inferred from the 9-18 and 9-19 walkthroughs; equivalence for other dependency arrangements remains unverified.

Released piston inventories expose unpaired absent edges as adhesive faces before heat balance and subsequent actuation. Their insulating faces retain their edge codes. Ordinary rigid-body translation preserves its existing surface codes.

Active extension reserves the housing against translation while planning the inventory's outward motion. Dependencies can store the housing inside another compressed piston. The active housing expands and consumes its hot impulse; the next actuator can release it while passively compressing it around its own load. An empty compressed nested piston exposes no surface through the outer opening. Contact lookup follows its exposed inventory recursively. In 9-24, the two rightward housings alternate expansion and compression as the assembly advances. Each expansion leaves its housing neutral before the following heat balance. The demon stays stationary during this chain, and the third housing reaches the goal.

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

World 9 reference tests compare [the 9-5 and 9-6 walkthrough](https://www.bilibili.com/video/BV1fVL9zTEXV/), [the updated 9-11 walkthrough](https://www.bilibili.com/video/BV1ewbW6cEx7/), [the updated 9-14 walkthrough](https://www.bilibili.com/video/BV1QugJ6PEMQ/), [the updated 9-16 walkthrough](https://www.bilibili.com/video/BV15wbW6cE5a/), [the 9-17 opening walkthrough](https://www.bilibili.com/video/BV19vLUzmEGP/), [the 9-13–9-17 walkthrough](https://www.bilibili.com/video/BV1gso2YaE5L/), [the 9-18–9-21 walkthrough](https://www.bilibili.com/video/BV1L6ZcYmEfc/), and [the numbered-room walkthrough](https://www.bilibili.com/video/BV1mRtQzyEK4/).

| Room | Video time | Checkpoint |
| --- | --- | --- |
| 9-5 | 28.60 s | The movable entrance advances right and mechanically displaces the overheated demon ahead of it. |
| 9-11 | 15.23 s | An upward push moves the transparent frame and its attached compressed housing together. |
| 9-14 | 2.67 s | Moving left from the retentive block leaves the demon at `(1, 2)` with neutral temperature. |
| 9-15 | 398.10 s | A blocked opening-side push compresses and reheats the retentive housing; automatic extension leaves it neutral, so reset restores it while retaining the demon. |
| 9-16 | 22.50, 50.70 s | The housing carries its side-attached retentive block upward. Reset cuts later anchor the load to the insulating wall, keeping the lower demon at `(4, 6)` for the final reset and goal push. The catalogue enters through the neutral unfinished entrance; the reference video shows the completed cold entrance. |
| 9-17 | 6.53 s | Both demons and their enclosing frame advance right in one input. |
| 9-17 | 436.90 s | The retained block reaches `(12, 7)` at neutral temperature while the housing remains compressed at `(9, 4)` and both demons remain active. |
| 9-18 | 137.20–146.80 s | The retentive demon remains inside the blocked housing at `(8, 4)`. Reset restores the housing elsewhere while retaining the demon at its current coordinate. |
| 9-19 | 293.80–294.80 s | Lateral compression and expansion clear the demon's passage while the glass remains at `(8, 4)` above the expanded housing at `(8, 5)`; the neutral block reaches `(10, 1)`. Intermediate native housing temperatures remain unverified. |
| 9-20 | 431.70–432.71 s | Reset restores the retained compressed housings before the final rightward push and thermal cascade place the first housing at `(16, 5)`. |
| 9-22 | 726.57 s | An upward push carries the transparent goal block together with the cold load above it. |
| 9-24 | 888.70–890.90 s | The final rightward push starts alternating strokes of the first two housings. One expands inside the other; the next releases and compresses it. Both consume heat on expansion, while inventory layers and the demon's position remain valid. |
| 9-25 | 912.37 s | The final turn places the retained solid load on the goal and leaves both surviving housings expanded. |

These checks validate the simulator's contracts and selected original puzzles. They do not establish exhaustive equivalence with original gameplay.