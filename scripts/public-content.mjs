export function publicDataset(source) {
  const worlds = source.worlds.filter(world => world.index === 1 || world.index === 2);
  if (worlds.length !== 2) throw new Error('The public build requires worlds 1 and 2.');
  const worldIds = new Set(worlds.map(world => world.id));
  const levels = structuredClone(source.levels.filter(level => worldIds.has(level.worldId)));
  const ids = new Set(levels.map(level => level.id));
  const hubId = 'preview-hub';
  const wall = { fixed: true, storesHeat: false, temperature: 0, edges: 0xaa };
  const cells = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (x === 0 || y === 0 || x === 8 || y === 8) cells.push({ x, y, ...wall });
  worlds.forEach((world, index) => cells.push({ x: 3 + index * 2, y: 3, ...wall, portal: { target: world.id, shortcut: false, before: { ...wall }, after: { ...wall } } }));
  for (const level of levels) {
    if (worldIds.has(level.id)) level.parentId = hubId;
    else if (!ids.has(level.parentId)) delete level.parentId;
    if (!ids.has(level.hintId)) delete level.hintId;
    for (const cell of level.cells) if (cell.portal && !ids.has(cell.portal.target)) delete cell.portal;
  }
  levels.unshift({ id: hubId, width: 9, height: 9, label: '体验入口', displayName: '体验入口', category: 'world', worldId: hubId, title: '体验入口', description: '公开内容限于 w1–w2。导入自己的原作关卡文件夹可读取完整目录。', cells, players: [{ x: 4, y: 5 }], goals: [], tail: [], notes: [] });
  return { version: source.version, edition: 'preview', world: worlds[0].id, root: hubId, hub: hubId, worlds: [{ id: hubId, index: 0, title: '体验入口', description: '连接公开体验世界的独立入口。', supported: true }, ...worlds], levels, hints: {} };
}

export function publicSolutions(catalogue, data) {
  const ids = new Set(data.levels.map(level => level.id));
  return { version: catalogue.version, solutions: catalogue.solutions.filter(solution => {
    if (!ids.has(solution.levelId)) return false;
    if (solution.start && 'session' in solution.start) return false;
    if (solution.start?.levelId && !ids.has(solution.start.levelId)) return false;
    return [...solution.actions.matchAll(/(?:ENTER|E)\(([^)]+)\)/gi)].every(match => ids.has(match[1]));
  }).map(solution => {
    const result = structuredClone(solution);
    if (result.start) for (const field of ['solved', 'visited']) if (result.start[field]) result.start[field] = result.start[field].filter(id => ids.has(id));
    return result;
  }) };
}
