import { diff } from '@specdrift/diff-core';

/**
 * Browser-side engine. The hosted demo has no database, so the comparison runs
 * locally in the tab; only "save & share" needs the API.
 */
export function localDiff({ before, after, fromVersion }) {
  let result;
  try {
    result = diff(before, after, { fromVersion: fromVersion || undefined });
  } catch (error) {
    // Normalise the engine error shape so the UI can show the same message
    // whether the comparison ran here or on the server.
    const wrapped = new Error(error.message);
    wrapped.code = error.name === 'SpecParseError' ? 'invalid_spec' : 'diff_failed';
    throw wrapped;
  }
  return {
    changes: result.changes,
    summary: result.summary,
    verdict: result.verdict,
    changelog: result.changelog,
    meta: result.meta,
    local: true,
  };
}
