const subscript = number => String(number).replace(/\d/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)]);

export function nativeLevelNames(root) {
  const names = new Map(), worldCounters = [-1, -1];
  let metaGroup = 0, metaVariant = 0, order = 0;
  function visit(node, kind, context, hintCounter, hintSource, inMeta = false) {
    let full, local, source, nextHints;
    if (node.world) {
      const family = kind === 'extra' ? 1 : 0, world = ++worldCounters[family];
      context = { family, world, main: 0, extra: 0 };
      full = local = `w${family ? String.fromCharCode(65 + world) : world}`;
      nextHints = { value: 0 }; source = full;
    } else if (kind === 'meta') {
      const variant = metaVariant++;
      local = String.fromCharCode(0x3b1 + metaGroup) + (variant ? subscript(variant + 1) : '');
      full = `0-${local}`; nextHints = { value: 0 }; source = full;
    } else if (kind === 'hint') {
      const index = hintCounter.value++;
      local = `?${index ? subscript(index) : ''}`;
      full = `${hintSource ?? ''}:${local}`; nextHints = hintCounter; source = hintSource;
    } else {
      local = kind === 'extra' ? String.fromCharCode(65 + context.extra++) : String(++context.main);
      const prefix = context.family ? String.fromCharCode(65 + context.world) : context.world;
      full = node === root ? node.id : `${prefix}-${local}`;
      if (node === root) local = node.id;
      nextHints = { value: 0 }; source = node === root ? undefined : full;
    }
    names.set(node.id, { displayName: full, localName: local, order: order++ });
    for (const [field, childKind] of [['metaSublevels', 'meta'], ['normalSublevels', 'main'], ['extraSublevels', 'extra'], ['hintSublevels', 'hint']]) {
      for (const child of node[field] ?? []) visit(child, childKind, context, nextHints, source, kind === 'meta');
    }
    if (kind === 'meta' && !inMeta) { metaGroup++; metaVariant = 0; }
  }
  visit(root, 'main', { family: 0, world: -1, main: 0, extra: 0 }, { value: 0 });
  return names;
}
