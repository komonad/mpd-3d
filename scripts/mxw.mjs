export function decodeMxw(buffer, id) {
  let cursor = 0;
  const read = () => {
    if (cursor >= buffer.length) throw new Error(`${id}: truncated at ${cursor}`);
    return buffer[cursor++];
  };
  const signed = () => { const n = read(); return n > 127 ? n - 256 : n; };
  const string = () => { const start = cursor; while (read() !== 0) {} return new TextDecoder().decode(buffer.subarray(start, cursor - 1)); };
  const block = () => {
    const tag = read();
    if (tag !== 2 && tag !== 5) throw new Error(`${id}: block tag ${tag} at ${cursor - 1}`);
    const flags = read(), edges = read(), storesHeat = !!(flags & 2), heatCapacity = tag === 5 ? read() | read() << 8 : storesHeat ? 1 : 0;
    return { fixed: !!(flags & 1), storesHeat, heatCapacity, temperature: [0, 1, -1, 2][(flags >> 2) & 3], edges };
  };
  const width = read(), height = read(), cells = [], players = [], pistons = [];
  const object = (x, y, container) => {
    const tag = read();
    const location = { x, y, ...(container === undefined ? {} : { container }) };
    if (tag === 0) return;
    if (tag === 1) { players.push(location); return; }
    if (tag === 2 || tag === 5) { cursor--; cells.push({ ...location, ...block() }); return; }
    if (tag === 3) {
      const shortcut = !read(), target = string(), before = block(), after = block();
      cells.push({ ...location, ...before, portal: { target, shortcut, before, after } });
      return;
    }
    if (tag === 4) {
      const flags = read(), properties = block(), order = read(), baseKey = cells.length;
      cells.push({ ...location, ...properties });
      pistons.push({ baseKey, headKey: -10000 - baseKey, direction: [3, 2, 1, 0][flags >> 1], expanded: !!(flags & 1), order, head: properties, model: 'boundary' });
      if (!(flags & 1)) object(x, y, baseKey);
      return;
    }
    throw new Error(`${id}: unsupported tile ${tag} at ${cursor - 1}`);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    object(x, y);
  }
  const goals = Array.from({ length: read() }, () => ({ x: signed(), y: signed() }));
  const tail = [...buffer.subarray(cursor)];
  const notes = [];
  for (let tag = read(); tag !== 0; tag = read()) {
    if (tag !== 2) throw new Error(`${id}: unsupported annotation ${tag}`);
    notes.push({ x: signed(), y: signed(), text: string() });
  }
  if (cursor !== buffer.length) throw new Error(`${id}: trailing bytes at ${cursor}`);
  return { id, width, height, cells, players, goals, tail, notes, ...(pistons.length ? { pistons } : {}) };
}
