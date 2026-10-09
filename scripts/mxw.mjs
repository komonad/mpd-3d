export function decodeMxw(buffer, id) {
  let cursor = 0;
  const read = () => {
    if (cursor >= buffer.length) throw new Error(`${id}: truncated at ${cursor}`);
    return buffer[cursor++];
  };
  const signed = () => { const n = read(); return n > 127 ? n - 256 : n; };
  const string = () => { const start = cursor; while (read() !== 0) {} return buffer.subarray(start, cursor - 1).toString('utf8'); };
  const block = () => {
    const tag = read();
    if (tag !== 2) throw new Error(`${id}: block tag ${tag} at ${cursor - 1}`);
    const flags = read(), edges = read();
    return { fixed: !!(flags & 1), storesHeat: !!(flags & 2), temperature: [0, 1, -1, 2][(flags >> 2) & 3], edges };
  };
  const width = read(), height = read(), cells = [], players = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tag = read();
    if (tag === 0) continue;
    if (tag === 1) { players.push({ x, y }); continue; }
    if (tag === 2) { cursor--; cells.push({ x, y, ...block() }); continue; }
    if (tag === 3) {
      const shortcut = !read(), target = string(), before = block(), after = block();
      cells.push({ x, y, ...before, portal: { target, shortcut, before, after } });
      continue;
    }
    throw new Error(`${id}: unsupported tile ${tag} at ${cursor - 1}`);
  }
  const goals = Array.from({ length: read() }, () => ({ x: signed(), y: signed() }));
  const tail = [...buffer.subarray(cursor)];
  const notes = [];
  for (let tag = read(); tag !== 0; tag = read()) {
    if (tag !== 2) throw new Error(`${id}: unsupported annotation ${tag}`);
    notes.push({ x: signed(), y: signed(), text: string() });
  }
  if (cursor !== buffer.length) throw new Error(`${id}: trailing bytes at ${cursor}`);
  return { id, width, height, cells, players, goals, tail, notes };
}
