import { diffPaths } from './paths-diff.js';
import { diffSchema } from './schema-diff.js';
import { SEVERITY, SEVERITY_ORDER, isBreaking } from './changes.js';
import { nextVersion, verdict } from './semver.js';
import { renderChangelog } from './changelog.js';
import { parseSpec, assertLooksLikeOpenApi, SpecParseError } from './parse.js';
import { isPlainObject, stableStringify } from './util.js';

export { SEVERITY, SEVERITY_ORDER, isBreaking, verdict, nextVersion, renderChangelog };
export { parseSpec, assertLooksLikeOpenApi, SpecParseError };
export { diffSchema, diffPaths };

function summarise(changes) {
  const counts = {
    [SEVERITY.BREAKING]: 0,
    [SEVERITY.ADDITIVE]: 0,
    [SEVERITY.COSMETIC]: 0,
  };
  for (const change of changes) {
    if (counts[change.severity] === undefined) counts[change.severity] = 0;
    counts[change.severity] += 1;
  }
  return {
    total: changes.length,
    breaking: counts[SEVERITY.BREAKING],
    additive: counts[SEVERITY.ADDITIVE],
    cosmetic: counts[SEVERITY.COSMETIC],
  };
}

function compareInfo(before, after) {
  const changes = [];
  const fields = ['title', 'version', 'description'];
  for (const field of fields) {
    const a = before?.info?.[field];
    const b = after?.info?.[field];
    if (a !== undefined && b !== undefined && a !== b && field === 'version') {
      changes.push({
        rule: 'info.version-changed',
        scope: 'info',
        severity: SEVERITY.COSMETIC,
        location: `info.${field}`,
        message: `Document version changed from ${a} to ${b}.`,
        before: a,
        after: b,
      });
    } else if (a !== b && field !== 'version' && (a !== undefined || b !== undefined)) {
      changes.push({
        rule: `info.${field}-changed`,
        scope: 'info',
        severity: SEVERITY.COSMETIC,
        location: `info.${field}`,
        message: `${field} changed.`,
        before: a,
        after: b,
      });
    }
  }
  return changes;
}

function compareComponents(before, after) {
  const changes = [];
  const beforeSchemas = isPlainObject(before?.components?.schemas) ? before.components.schemas : {};
  const afterSchemas = isPlainObject(after?.components?.schemas) ? after.components.schemas : {};

  for (const name of Object.keys(beforeSchemas)) {
    if (!(name in afterSchemas)) {
      changes.push({
        rule: 'component-schema.removed',
        scope: 'schema',
        severity: SEVERITY.BREAKING,
        location: `components.schemas.${name}`,
        message: `Reusable schema "${name}" was removed.`,
      });
    }
  }
  for (const name of Object.keys(afterSchemas)) {
    if (!(name in beforeSchemas)) {
      changes.push({
        rule: 'component-schema.added',
        scope: 'schema',
        severity: SEVERITY.ADDITIVE,
        location: `components.schemas.${name}`,
        message: `New reusable schema "${name}" added.`,
      });
      continue;
    }
    changes.push(
      ...diffSchema(beforeSchemas[name], afterSchemas[name], {
        root: after,
        path: `components/schemas/${name}`,
        location: `components.schemas.${name}`,
      }),
    );
  }
  return changes;
}

/**
 * Diff two OpenAPI documents.
 * Accepts objects, JSON strings, or YAML strings.
 * Returns { changes, summary, verdict, changelog, meta }.
 */
export function diff(beforeInput, afterInput, options = {}) {
  const before = assertLooksLikeOpenApi(parseSpec(beforeInput, 'before'), 'before');
  const after = assertLooksLikeOpenApi(parseSpec(afterInput, 'after'), 'after');

  const changes = [
    ...compareInfo(before, after),
    ...diffPaths(before, after),
    ...compareComponents(before, after),
  ];

  // Stable ordering: severity first, then location, then rule — never filesystem or key order.
  changes.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      String(a.location).localeCompare(String(b.location)) ||
      String(a.rule).localeCompare(String(b.rule)),
  );

  const summary = summarise(changes);
  const release = options.fromVersion
    ? nextVersion(options.fromVersion, changes)
    : verdict(changes);

  const meta = {
    beforeVersion: before?.info?.version ?? null,
    afterVersion: after?.info?.version ?? null,
    beforeTitle: before?.info?.title ?? null,
    afterTitle: after?.info?.title ?? null,
    openapi: after?.openapi ?? after?.swagger ?? null,
    pathsCompared: Math.max(
      Object.keys(isPlainObject(before.paths) ? before.paths : {}).length,
      Object.keys(isPlainObject(after.paths) ? after.paths : {}).length,
    ),
  };

  const versionLabel = options.fromVersion
    ? { fromVersion: options.fromVersion, toVersion: release.next ?? options.fromVersion }
    : { fromVersion: meta.beforeVersion, toVersion: meta.afterVersion };

  const changelog = renderChangelog(changes, {
    title: `${meta.afterTitle ?? 'API'} changelog`,
    ...versionLabel,
    level: release.level,
  });

  return { changes, summary, verdict: release, changelog, meta };
}

export default diff;
