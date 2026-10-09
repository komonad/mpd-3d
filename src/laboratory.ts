import type { BlockProperties, Level, Piston, Temperature } from './types';
const properties = (temperature: Temperature = 0, edges = 0x55, fixed = false, storesHeat = true): BlockProperties => ({ temperature, edges, fixed, storesHeat });
const cell = (x: number, y: number, temperature: Temperature = 0, edges = 0x55, fixed = false, storesHeat = true) => ({ x, y, ...properties(temperature, edges, fixed, storesHeat) });
function room(id: string, title: string, description: string, cells: Level['cells'], player = { x: 5, y: 6, temperature: 0 as Temperature }): Level {
  const walls: Level['cells'] = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 11; x++) if (x === 0 || y === 0 || x === 10 || y === 8) walls.push(cell(x, y, 0, 0xaa, true));
  const perimeter = new Set(walls.map(c => `${c.x},${c.y}`)), directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  for (const wall of walls) directions.forEach(([dx, dy], dir) => { if (perimeter.has(`${wall.x + dx},${wall.y + dy}`)) wall.edges &= ~(3 << (dir * 2)); });
  return { id, title, description, label: id.replace('lab-', 'L-'), category: 'lab', width: 11, height: 9, cells: [...cells, ...walls], players: [player], goals: [], tail: [0] };
}
const materials = room('lab-01', '材质与连接', '长条是一个整体；并排的独立方块保留间隙。透明块不储热。', [cell(2, 2, -1, 0x51), cell(2, 3, -1, 0x11), cell(2, 4, -1, 0x15), cell(5, 2, 0), cell(6, 2, 0), cell(8, 2, 1), cell(5, 4, 0, 0x55, false, false), cell(8, 4, 0, 0xff)]);
const conduction = room('lab-02', '小妖也是导体', '向下走入冷热之间。小妖变色，但不计入冷热数量。', [cell(4, 4, 1, 0x55, true), cell(6, 4, -1, 0x55, true), cell(3, 6, -1, 0x55, true)], { x: 5, y: 3, temperature: 0 });
const sticky = room('lab-03', '粘边与透明块', '深浅棋盘格表示粘边。把透明块推向粘块，再从侧面推动它们。', [cell(3, 4, 0, 0x55, false, false), cell(5, 4, 0, 0x57), cell(7, 2, 1), cell(7, 6, -1)], { x: 2, y: 4, temperature: 0 });
const piston = room('lab-04', '活塞与热量', '向右靠近热块，观察加热后的活塞伸出。按 Z 撤销整轮结算。', [cell(5, 4, 0, 0x55, true), cell(5, 3, 1), cell(7, 4, 0)], { x: 2, y: 5, temperature: 0 });
piston.pistons = [{ baseKey: 0, headKey: 1000, direction: 2, expanded: false, order: 0, head: properties(0, 0x55, false, false) }];
const recovery = room('lab-05', '假死与恢复', '向左压缩活塞：小妖中途变热，活塞再伸出后恢复常温。', [cell(4, 4, 0, 0x55, true), cell(5, 4, 0, 0x55, false, false)], { x: 6, y: 4, temperature: 0 });
recovery.pistons = [{ baseKey: 0, headKey: 1, direction: 2, expanded: true, order: 0, head: properties(0, 0x55, false, false) }];
const poses = room('lab-06', '小妖的温度状态', '左侧冷、右侧热。小妖随温度变色；碰热后进入假死状态，眼睛变成 ×。', [cell(2, 4, -1, 0x55, true), cell(8, 4, 1, 0x55, true)], { x: 5, y: 4, temperature: 0 });
const multiple = room('lab-07', '同步行动', '方向键同时控制所有可行动的小妖。高温小妖停止移动，仍然参与热传导。', [cell(3, 3), cell(7, 3), cell(8, 5, 1, 0x55, true)], { x: 3, y: 6, temperature: 0 });
multiple.players.push({ x: 7, y: 6, temperature: 0 });
const retentive = room('lab-08', '第4温度与重置', '绿色会传递到常温物体；高温与低温优先。重置时，第4温度物体保留当前位置。', [cell(3, 3, 2), cell(5, 3), cell(7, 3, -1)], { x: 3, y: 5, temperature: 0 });
export const laboratory: Level[] = [materials, conduction, sticky, piston, recovery, poses, multiple, retentive];
