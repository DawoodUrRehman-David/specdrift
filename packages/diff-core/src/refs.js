import { isPlainObject } from './util.js';

const MAX_DEPTH = 12;

/**
 * Resolve local `$ref` pointers ("#/components/schemas/X") against the root document.
 * External refs are left untouched — we only promise document-local resolution.
 * Cycles are cut by depth limit and by tracking visited pointers per branch.
 */
export function resolveRef(node, root, seen = new Set(), depth = 0) {
  if (depth > MAX_DEPTH || !isPlainObject(node)) return node;
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
    const ref = node.$ref;
    if (seen.has(ref)) return { $ref: ref, circular: true };
    const target = lookupRef(root, ref);
    if (target === undefined) return node;
    const nextSeen = new Set(seen).add(ref);
    const resolved = resolveRef(target, root, nextSeen, depth + 1);
    // sibling keys next to $ref are honoured per OpenAPI 3.1
    const siblings = Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$ref'));
    if (Object.keys(siblings).length === 0) return resolved;
    return resolveRef({ ...resolved, ...siblings }, root, nextSeen, depth + 1);
  }
  return node;
}

export function lookupRef(root, ref) {
  const parts = ref
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cursor = root;
  for (const part of parts) {
    if (!isPlainObject(cursor) && !Array.isArray(cursor)) return undefined;
    cursor = cursor[part];
    if (cursor === undefined) return undefined;
  }
  return cursor;
}
