export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deterministic serialisation so key order never produces phantom changes. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function sameValue(a, b) {
  return stableStringify(a) === stableStringify(b);
}

export function truncate(value, max = 160) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  if (text == null) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Turn `#/components/schemas/User/properties/id` into a readable pointer. */
export function pointerToLabel(pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return pointer;
  return pointer
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join('.');
}
