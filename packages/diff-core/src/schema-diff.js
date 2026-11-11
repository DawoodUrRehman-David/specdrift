import { makeChange, SCOPE, SEVERITY } from './changes.js';
import { resolveRef } from './refs.js';
import { isPlainObject, pointerToLabel, stableStringify, truncate } from './util.js';

const MAX_DEPTH = 25;

/**
 * Compare two JSON Schemas and return change records.
 * Uniform rules in both directions (request and response) — documented in the README.
 */
export function diffSchema(before, after, ctx = {}, depth = 0) {
  const changes = [];
  const { root, path = '', location = path } = ctx;
  const where = location || path || '(root)';

  if (depth > MAX_DEPTH) return changes;

  const a = resolveRef(before, root, new Set(), depth);
  const b = resolveRef(after, root, new Set(), depth);

  if (stableStringify(a) === stableStringify(b)) return changes;

  const typeOf = (s) => {
    if (!isPlainObject(s)) return undefined;
    return Array.isArray(s.type) ? s.type.slice().sort().join('|') : s.type;
  };

  const beforeType = typeOf(a);
  const afterType = typeOf(b);

  if (beforeType && afterType && beforeType !== afterType) {
    changes.push(
      makeChange({
        rule: 'schema.type-changed',
        scope: SCOPE.SCHEMA,
        severity: SEVERITY.BREAKING,
        location: where,
        message: `Type changed from ${beforeType} to ${afterType} — existing clients decode this value differently.`,
        before: beforeType,
        after: afterType,
      }),
    );
    // Types diverged; comparing deeper keywords produces noise.
    return changes;
  }

  // ---- enum ----------------------------------------------------------------
  if (Array.isArray(a?.enum) || Array.isArray(b?.enum)) {
    const beforeSet = new Set((a?.enum ?? []).map(stableStringify));
    const afterSet = new Set((b?.enum ?? []).map(stableStringify));
    for (const value of beforeSet) {
      if (!afterSet.has(value)) {
        changes.push(
          makeChange({
            rule: 'schema.enum-value-removed',
            scope: SCOPE.SCHEMA,
            severity: SEVERITY.BREAKING,
            location: where,
            message: `Enum value ${truncate(value, 60)} no longer accepted or returned.`,
            before: value,
          }),
        );
      }
    }
    for (const value of afterSet) {
      if (!beforeSet.has(value)) {
        changes.push(
          makeChange({
            rule: 'schema.enum-value-added',
            scope: SCOPE.SCHEMA,
            severity: Array.isArray(a?.enum) ? SEVERITY.ADDITIVE : SEVERITY.BREAKING,
            location: where,
            message: Array.isArray(a?.enum)
              ? `New enum value ${truncate(value, 60)} added — clients with exhaustive switches may not handle it.`
              : `Enum constraint introduced — previously any value was allowed.`,
            after: value,
          }),
        );
      }
    }
  }

  // ---- nullable / format / constraints ------------------------------------
  const nullableOf = (s) => (isPlainObject(s) ? Boolean(s.nullable) : false);
  if (nullableOf(a) && !nullableOf(b)) {
    changes.push(
      makeChange({
        rule: 'schema.nullable-removed',
        scope: SCOPE.SCHEMA,
        severity: SEVERITY.BREAKING,
        location: where,
        message: 'Field no longer accepts null.',
      }),
    );
  }

  if (a?.format && b?.format && a.format !== b.format) {
    changes.push(
      makeChange({
        rule: 'schema.format-changed',
        scope: SCOPE.SCHEMA,
        severity: SEVERITY.BREAKING,
        location: where,
        message: `Format changed from ${a.format} to ${b.format}.`,
        before: a.format,
        after: b.format,
      }),
    );
  }

  const tightening = [
    ['maxLength', 'decreased'],
    ['maximum', 'decreased'],
    ['maxItems', 'decreased'],
    ['minLength', 'increased'],
    ['minimum', 'increased'],
    ['minItems', 'increased'],
  ];
  for (const [keyword, direction] of tightening) {
    const beforeValue = a?.[keyword];
    const afterValue = b?.[keyword];
    if (typeof beforeValue === 'number' && typeof afterValue === 'number' && beforeValue !== afterValue) {
      const tightened = direction === 'decreased' ? afterValue < beforeValue : afterValue > beforeValue;
      changes.push(
        makeChange({
          rule: 'schema.constraint-changed',
          scope: SCOPE.SCHEMA,
          severity: tightened ? SEVERITY.BREAKING : SEVERITY.ADDITIVE,
          location: where,
          message: `${keyword} ${tightened ? 'tightened' : 'relaxed'} from ${beforeValue} to ${afterValue}.`,
          before: beforeValue,
          after: afterValue,
        }),
      );
    }
  }

  if (a?.additionalProperties !== false && b?.additionalProperties === false) {
    changes.push(
      makeChange({
        rule: 'schema.additional-properties-forbidden',
        scope: SCOPE.SCHEMA,
        severity: SEVERITY.BREAKING,
        location: where,
        message: 'Unknown properties are now rejected (additionalProperties: false).',
      }),
    );
  }

  if (stableStringify(a?.default) !== stableStringify(b?.default) && (a?.default !== undefined || b?.default !== undefined)) {
    changes.push(
      makeChange({
        rule: 'schema.default-changed',
        scope: SCOPE.SCHEMA,
        severity: SEVERITY.COSMETIC,
        location: where,
        message: 'Default value changed.',
        before: truncate(a?.default, 60),
        after: truncate(b?.default, 60),
      }),
    );
  }

  // ---- required ------------------------------------------------------------
  const beforeRequired = new Set(Array.isArray(a?.required) ? a.required : []);
  const afterRequired = new Set(Array.isArray(b?.required) ? b.required : []);
  for (const field of afterRequired) {
    if (!beforeRequired.has(field)) {
      changes.push(
        makeChange({
          rule: 'schema.required-added',
          scope: SCOPE.SCHEMA,
          severity: SEVERITY.BREAKING,
          location: `${where} › required`,
          message: `"${field}" became required.`,
          after: field,
        }),
      );
    }
  }
  for (const field of beforeRequired) {
    if (!afterRequired.has(field)) {
      changes.push(
        makeChange({
          rule: 'schema.required-removed',
          scope: SCOPE.SCHEMA,
          severity: SEVERITY.ADDITIVE,
          location: `${where} › required`,
          message: `"${field}" is no longer required.`,
          before: field,
        }),
      );
    }
  }

  // ---- properties ----------------------------------------------------------
  const beforeProps = isPlainObject(a?.properties) ? a.properties : {};
  const afterProps = isPlainObject(b?.properties) ? b.properties : {};

  for (const name of Object.keys(beforeProps)) {
    if (!(name in afterProps)) {
      changes.push(
        makeChange({
          rule: 'schema.property-removed',
          scope: SCOPE.SCHEMA,
          severity: SEVERITY.BREAKING,
          location: `${where} › ${name}`,
          message: `Property "${name}" was removed.`,
          before: truncate(beforeProps[name], 120),
        }),
      );
    }
  }
  for (const name of Object.keys(afterProps)) {
    if (!(name in beforeProps)) {
      const isRequired = afterRequired.has(name);
      changes.push(
        makeChange({
          rule: 'schema.property-added',
          scope: SCOPE.SCHEMA,
          severity: isRequired ? SEVERITY.BREAKING : SEVERITY.ADDITIVE,
          location: `${where} › ${name}`,
          message: isRequired
            ? `New required property "${name}" added — every client must now send it.`
            : `New optional property "${name}" added.`,
          after: truncate(afterProps[name], 120),
        }),
      );
    }
  }
  for (const name of Object.keys(afterProps)) {
    if (name in beforeProps) {
      changes.push(
        ...diffSchema(beforeProps[name], afterProps[name], {
          root,
          path: `${path}/${name}`,
          location: `${where} › ${name}`,
        }, depth + 1),
      );
    }
  }

  // ---- array items ---------------------------------------------------------
  if (isPlainObject(a?.items) || isPlainObject(b?.items)) {
    changes.push(
      ...diffSchema(a?.items, b?.items, {
        root,
        path: `${path}/items`,
        location: `${where} › items`,
      }, depth + 1),
    );
  }

  // ---- composition ---------------------------------------------------------
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const beforeList = Array.isArray(a?.[keyword]) ? a[keyword] : null;
    const afterList = Array.isArray(b?.[keyword]) ? b[keyword] : null;
    if (!beforeList && !afterList) continue;
    const beforeKeys = new Set((beforeList ?? []).map((s) => pointerToLabel(s?.$ref ?? stableStringify(s))));
    const afterKeys = new Set((afterList ?? []).map((s) => pointerToLabel(s?.$ref ?? stableStringify(s))));
    for (const key of beforeKeys) {
      if (!afterKeys.has(key)) {
        changes.push(
          makeChange({
            rule: 'schema.variant-removed',
            scope: SCOPE.SCHEMA,
            severity: keyword === 'anyOf' || keyword === 'oneOf' ? SEVERITY.BREAKING : SEVERITY.BREAKING,
            location: `${where} › ${keyword}`,
            message: `${keyword} variant ${truncate(key, 80)} removed.`,
            before: key,
          }),
        );
      }
    }
    for (const key of afterKeys) {
      if (!beforeKeys.has(key)) {
        changes.push(
          makeChange({
            rule: 'schema.variant-added',
            scope: SCOPE.SCHEMA,
            severity: keyword === 'allOf' ? SEVERITY.BREAKING : SEVERITY.ADDITIVE,
            location: `${where} › ${keyword}`,
            message: `${keyword} variant ${truncate(key, 80)} added.`,
            after: key,
          }),
        );
      }
    }
  }

  return changes;
}
