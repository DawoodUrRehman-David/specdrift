import YAML from 'yaml';

export class SpecParseError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SpecParseError';
    this.cause = cause;
  }
}

/**
 * Accept a spec as an object, a JSON string, or a YAML string.
 * Returns a plain object. Throws SpecParseError with a readable message.
 */
export function parseSpec(input, label = 'spec') {
  if (input == null) {
    throw new SpecParseError(`${label}: no document provided`);
  }
  if (typeof input === 'object') {
    if (Array.isArray(input)) {
      throw new SpecParseError(`${label}: expected an object, received an array`);
    }
    return input;
  }
  if (typeof input !== 'string') {
    throw new SpecParseError(`${label}: expected an object or string, received ${typeof input}`);
  }

  const text = input.trim();
  if (!text) {
    throw new SpecParseError(`${label}: document is empty`);
  }

  // JSON first: it is a subset of YAML but parses far faster and gives better errors.
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      throw new SpecParseError(`${label}: JSON root must be an object`);
    } catch (err) {
      if (err instanceof SpecParseError) throw err;
      throw new SpecParseError(`${label}: invalid JSON — ${err.message}`, err);
    }
  }

  try {
    const parsed = YAML.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SpecParseError(`${label}: YAML root must be a mapping`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof SpecParseError) throw err;
    throw new SpecParseError(`${label}: invalid YAML — ${err.message}`, err);
  }
}

/** Minimal shape check so we fail loudly on a random JSON blob instead of diffing nothing. */
export function assertLooksLikeOpenApi(spec, label = 'spec') {
  const looksOpenApi = Boolean(spec.openapi || spec.swagger || spec.paths || spec.components);
  if (!looksOpenApi) {
    throw new SpecParseError(
      `${label}: not recognisable as an OpenAPI document (missing openapi/swagger/paths)`,
    );
  }
  return spec;
}
