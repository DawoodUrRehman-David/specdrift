import { SEVERITY } from './changes.js';

export function parseVersion(version) {
  if (typeof version !== 'string') return null;
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function bumpVersion(version, kind) {
  const parsed = parseVersion(version);
  if (!parsed) return null;
  if (kind === 'none') return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  if (kind === 'major') return `${parsed.major + 1}.0.0`;
  if (kind === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`;
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

/**
 * Decide the release bump required by a set of changes.
 * breaking -> major, additive -> minor, cosmetic -> patch, none -> none.
 */
export function verdict(changes) {
  const has = (severity) => changes.some((change) => change.severity === severity);

  if (has(SEVERITY.BREAKING)) {
    return {
      level: 'major',
      reason: 'At least one breaking change means existing clients can fail after this release.',
    };
  }
  if (has(SEVERITY.ADDITIVE)) {
    return {
      level: 'minor',
      reason: 'New capability added with no breakage; consumers can adopt it at their own pace.',
    };
  }
  if (has(SEVERITY.COSMETIC) || changes.length > 0) {
    return {
      level: 'patch',
      reason: 'Documentation-level changes only; behaviour is unchanged.',
    };
  }
  return { level: 'none', reason: 'No changes detected between the two documents.' };
}

export function nextVersion(current, changes) {
  const result = verdict(changes);
  const next = bumpVersion(current, result.level);
  return { ...result, current: current ?? null, next };
}
