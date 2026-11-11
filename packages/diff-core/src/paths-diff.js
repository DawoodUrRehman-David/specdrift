import { makeChange, SCOPE, SEVERITY } from './changes.js';
import { diffSchema } from './schema-diff.js';
import { resolveRef } from './refs.js';
import { isPlainObject, stableStringify, truncate } from './util.js';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export function diffPaths(beforeSpec, afterSpec) {
  const changes = [];
  const beforePaths = normalizePaths(beforeSpec.paths);
  const afterPaths = normalizePaths(afterSpec.paths);
  const ctx = { root: afterSpec, beforeRoot: beforeSpec };

  for (const path of Object.keys(afterPaths)) {
    if (!(path in beforePaths)) {
      for (const method of methodsOf(afterPaths[path])) {
        changes.push(
          makeChange({
            rule: 'operation.added',
            scope: SCOPE.OPERATION,
            severity: SEVERITY.ADDITIVE,
            location: `${method.toUpperCase()} ${path}`,
            message: `New endpoint ${method.toUpperCase()} ${path}.`,
          }),
        );
      }
    }
  }

  for (const path of Object.keys(beforePaths)) {
    if (!(path in afterPaths)) {
      for (const method of methodsOf(beforePaths[path])) {
        changes.push(
          makeChange({
            rule: 'operation.removed',
            scope: SCOPE.OPERATION,
            severity: SEVERITY.BREAKING,
            location: `${method.toUpperCase()} ${path}`,
            message: `Endpoint ${method.toUpperCase()} ${path} was removed.`,
          }),
        );
      }
      continue;
    }

    const beforePathItem = beforePaths[path] ?? {};
    const afterPathItem = afterPaths[path] ?? {};
    const beforeMethods = new Set(methodsOf(beforePathItem));
    const afterMethods = new Set(methodsOf(afterPathItem));

    for (const method of afterMethods) {
      if (!beforeMethods.has(method)) {
        changes.push(
          makeChange({
            rule: 'operation.added',
            scope: SCOPE.OPERATION,
            severity: SEVERITY.ADDITIVE,
            location: `${method.toUpperCase()} ${path}`,
            message: `New method ${method.toUpperCase()} on ${path}.`,
          }),
        );
      }
    }
    for (const method of beforeMethods) {
      if (!afterMethods.has(method)) {
        changes.push(
          makeChange({
            rule: 'operation.removed',
            scope: SCOPE.OPERATION,
            severity: SEVERITY.BREAKING,
            location: `${method.toUpperCase()} ${path}`,
            message: `Method ${method.toUpperCase()} removed from ${path}.`,
          }),
        );
      }
    }

    for (const method of afterMethods) {
      if (!beforeMethods.has(method)) continue;
      const beforeOp = resolveRef(beforePathItem[method], beforeSpec);
      const afterOp = resolveRef(afterPathItem[method], afterSpec);
      changes.push(
        ...diffOperation(beforeOp, afterOp, {
          ...ctx,
          path,
          method,
          location: `${method.toUpperCase()} ${path}`,
        }),
      );
    }
  }

  return changes;
}

function methodsOf(pathItem) {
  if (!isPlainObject(pathItem)) return [];
  return HTTP_METHODS.filter((m) => isPlainObject(pathItem[m]));
}

function normalizePaths(paths) {
  return isPlainObject(paths) ? paths : {};
}

function diffOperation(beforeOp, afterOp, ctx) {
  const changes = [];
  const { location, path, method } = ctx;

  if (!isPlainObject(beforeOp) || !isPlainObject(afterOp)) return changes;

  changes.push(...diffParameters(beforeOp, afterOp, ctx));
  changes.push(...diffRequestBody(beforeOp, afterOp, ctx));
  changes.push(...diffResponses(beforeOp, afterOp, ctx));
  changes.push(...diffSecurity(beforeOp, afterOp, ctx));

  if (beforeOp.deprecated !== true && afterOp.deprecated === true) {
    changes.push(
      makeChange({
        rule: 'operation.deprecated',
        scope: SCOPE.OPERATION,
        severity: SEVERITY.ADDITIVE,
        location,
        message: `${method.toUpperCase()} ${path} is now marked deprecated.`,
      }),
    );
  }

  if ((beforeOp.summary ?? '') !== (afterOp.summary ?? '')) {
    changes.push(
      makeChange({
        rule: 'operation.summary-changed',
        scope: SCOPE.OPERATION,
        severity: SEVERITY.COSMETIC,
        location,
        message: 'Summary changed.',
        before: truncate(beforeOp.summary ?? '', 80),
        after: truncate(afterOp.summary ?? '', 80),
      }),
    );
  }

  return changes;
}

function parameterKey(param, index) {
  if (isPlainObject(param) && (param.name || param.in)) return `${param.in ?? '?'}:${param.name ?? index}`;
  if (isPlainObject(param) && typeof param.$ref === 'string') return `$ref:${param.$ref}`;
  return `#${index}`;
}

function diffParameters(beforeOp, afterOp, ctx) {
  const changes = [];
  const { location, beforeRoot, root } = ctx;

  const beforeList = Array.isArray(beforeOp.parameters) ? beforeOp.parameters : [];
  const afterList = Array.isArray(afterOp.parameters) ? afterOp.parameters : [];

  const toMap = (list, spec) => {
    const map = new Map();
    list.forEach((param, index) => {
      const resolved = resolveRef(param, spec);
      map.set(parameterKey(resolved, index), resolved);
    });
    return map;
  };

  const beforeMap = toMap(beforeList, beforeRoot);
  const afterMap = toMap(afterList, root);

  for (const [key, param] of afterMap) {
    if (!beforeMap.has(key)) {
      const required = param.required === true;
      changes.push(
        makeChange({
          rule: required ? 'parameter.added-required' : 'parameter.added-optional',
          scope: SCOPE.PARAMETER,
          severity: required ? SEVERITY.BREAKING : SEVERITY.ADDITIVE,
          location: `${location} → parameter ${key}`,
          message: required
            ? `New required parameter "${param.name}" (in ${param.in}) — callers must now supply it.`
            : `New optional parameter "${param.name}" (in ${param.in}).`,
        }),
      );
    } else {
      const beforeParam = beforeMap.get(key);
      if (beforeParam.required !== true && param.required === true) {
        changes.push(
          makeChange({
            rule: 'parameter.became-required',
            scope: SCOPE.PARAMETER,
            severity: SEVERITY.BREAKING,
            location: `${location} → parameter ${key}`,
            message: `Parameter "${param.name}" (in ${param.in}) became required.`,
          }),
        );
      } else if (beforeParam.required === true && param.required !== true) {
        changes.push(
          makeChange({
            rule: 'parameter.became-optional',
            scope: SCOPE.PARAMETER,
            severity: SEVERITY.ADDITIVE,
            location: `${location} → parameter ${key}`,
            message: `Parameter "${param.name}" (in ${param.in}) is no longer required.`,
          }),
        );
      }

      const beforeSchema = resolveRef(beforeParam.schema, beforeRoot);
      const afterSchema = resolveRef(param.schema, root);
      if (beforeSchema || afterSchema) {
        changes.push(
          ...diffSchema(beforeSchema, afterSchema, {
            root,
            path: `${ctx.path}/${ctx.method}/parameters/${key}/schema`,
            location: `${location} → parameter ${key} schema`,
          }),
        );
      }
    }
  }

  for (const [key, param] of beforeMap) {
    if (!afterMap.has(key)) {
      changes.push(
        makeChange({
          rule: 'parameter.removed',
          scope: SCOPE.PARAMETER,
          // Removing a required parameter is breaking; removing an optional one is safe.
          severity: param.required === true ? SEVERITY.BREAKING : SEVERITY.ADDITIVE,
          location: `${location} → parameter ${key}`,
          message: `Parameter "${param.name}" (in ${param.in}) was removed.`,
        }),
      );
    }
  }

  return changes;
}

function diffRequestBody(beforeOp, afterOp, ctx) {
  const changes = [];
  const { location, beforeRoot, root } = ctx;

  const beforeBody = beforeOp.requestBody ? resolveRef(beforeOp.requestBody, beforeRoot) : undefined;
  const afterBody = afterOp.requestBody ? resolveRef(afterOp.requestBody, root) : undefined;

  if (!beforeBody && !afterBody) return changes;

  if (!beforeBody && afterBody) {
    changes.push(
      makeChange({
        rule: afterBody.required ? 'request-body.added-required' : 'request-body.added-optional',
        scope: SCOPE.REQUEST_BODY,
        severity: afterBody.required ? SEVERITY.BREAKING : SEVERITY.ADDITIVE,
        location,
        message: afterBody.required ? 'Request body is now required.' : 'Optional request body added.',
      }),
    );
    return changes;
  }

  if (beforeBody && !afterBody) {
    changes.push(
      makeChange({
        rule: 'request-body.removed',
        scope: SCOPE.REQUEST_BODY,
        severity: SEVERITY.BREAKING,
        location,
        message: 'Request body was removed — clients sending a body will break.',
      }),
    );
    return changes;
  }

  if (beforeBody.required !== true && afterBody.required === true) {
    changes.push(
      makeChange({
        rule: 'request-body.became-required',
        scope: SCOPE.REQUEST_BODY,
        severity: SEVERITY.BREAKING,
        location,
        message: 'Request body became required.',
      }),
    );
  }

  const beforeTypes = new Set(Object.keys(beforeBody.content ?? {}));
  const afterTypes = new Set(Object.keys(afterBody.content ?? {}));

  for (const mediaType of beforeTypes) {
    if (!afterTypes.has(mediaType)) {
      changes.push(
        makeChange({
          rule: 'request-body.media-type-removed',
          scope: SCOPE.REQUEST_BODY,
          severity: SEVERITY.BREAKING,
          location: `${location} → ${mediaType}`,
          message: `Request media type ${mediaType} no longer accepted.`,
        }),
      );
    }
  }
  for (const mediaType of afterTypes) {
    if (!beforeTypes.has(mediaType)) {
      changes.push(
        makeChange({
          rule: 'request-body.media-type-added',
          scope: SCOPE.REQUEST_BODY,
          severity: SEVERITY.ADDITIVE,
          location: `${location} → ${mediaType}`,
          message: `Request media type ${mediaType} now accepted.`,
        }),
      );
    }
  }

  for (const mediaType of afterTypes) {
    if (!beforeTypes.has(mediaType)) continue;
    changes.push(
      ...diffSchema(beforeBody.content?.[mediaType]?.schema, afterBody.content?.[mediaType]?.schema, {
        root,
        path: `${ctx.path}/${ctx.method}/requestBody/${mediaType}`,
        location: `${location} → request ${mediaType}`,
      }),
    );
  }

  return changes;
}

function diffResponses(beforeOp, afterOp, ctx) {
  const changes = [];
  const { location, beforeRoot, root } = ctx;

  const beforeResponses = isPlainObject(beforeOp.responses) ? beforeOp.responses : {};
  const afterResponses = isPlainObject(afterOp.responses) ? afterOp.responses : {};

  for (const status of Object.keys(beforeResponses)) {
    if (!(status in afterResponses)) {
      changes.push(
        makeChange({
          rule: 'response.removed',
          scope: SCOPE.RESPONSE,
          severity: SEVERITY.BREAKING,
          location: `${location} → ${status}`,
          message: `Response ${status} is no longer documented — consumers relying on it break.`,
        }),
      );
    }
  }

  for (const status of Object.keys(afterResponses)) {
    if (!(status in beforeResponses)) {
      changes.push(
        makeChange({
          rule: 'response.added',
          scope: SCOPE.RESPONSE,
          severity: SEVERITY.ADDITIVE,
          location: `${location} → ${status}`,
          message: `New response ${status} documented — clients may need to handle it.`,
        }),
      );
      continue;
    }

    const beforeResponse = resolveRef(beforeResponses[status], beforeRoot);
    const afterResponse = resolveRef(afterResponses[status], root);
    const beforeContent = isPlainObject(beforeResponse?.content) ? beforeResponse.content : {};
    const afterContent = isPlainObject(afterResponse?.content) ? afterResponse.content : {};

    for (const mediaType of Object.keys(beforeContent)) {
      if (!(mediaType in afterContent)) {
        changes.push(
          makeChange({
            rule: 'response.media-type-removed',
            scope: SCOPE.RESPONSE,
            severity: SEVERITY.BREAKING,
            location: `${location} → ${status} ${mediaType}`,
            message: `Response media type ${mediaType} removed from ${status}.`,
          }),
        );
      }
    }
    for (const mediaType of Object.keys(afterContent)) {
      if (!(mediaType in beforeContent)) {
        changes.push(
          makeChange({
            rule: 'response.media-type-added',
            scope: SCOPE.RESPONSE,
            severity: SEVERITY.ADDITIVE,
            location: `${location} → ${status} ${mediaType}`,
            message: `Response media type ${mediaType} added to ${status}.`,
          }),
        );
        continue;
      }
      changes.push(
        ...diffSchema(beforeContent[mediaType]?.schema, afterContent[mediaType]?.schema, {
          root,
          path: `${ctx.path}/${ctx.method}/responses/${status}/${mediaType}`,
          location: `${location} → response ${status} ${mediaType}`,
        }),
      );
    }
  }

  return changes;
}

function securitySets(security) {
  if (security === undefined) return { defined: false, list: [] };
  if (!Array.isArray(security)) return { defined: false, list: [] };
  return {
    defined: true,
    list: security.map((entry) => (isPlainObject(entry) ? entry : {})),
  };
}

function diffSecurity(beforeOp, afterOp, ctx) {
  const changes = [];
  const { location } = ctx;
  const before = securitySets(beforeOp.security);
  const after = securitySets(afterOp.security);

  // The new document does not declare security here, so it inherits the global
  // requirement. We cannot tell what that is from the operation alone, so we stay quiet.
  if (!after.defined) return changes;

  if (!before.defined) {
    if (after.list.length > 0) {
      changes.push(
        makeChange({
          rule: 'operation.security-added',
          scope: SCOPE.SECURITY,
          severity: SEVERITY.BREAKING,
          location,
          message: 'This operation now requires authentication.',
        }),
      );
    }
    return changes;
  }

  if (after.list.length === 0) {
    if (before.list.length > 0) {
      changes.push(
        makeChange({
          rule: 'operation.security-removed',
          scope: SCOPE.SECURITY,
          severity: SEVERITY.ADDITIVE,
          location,
          message: 'This operation no longer requires authentication.',
        }),
      );
    }
    return changes;
  }

  const beforeSchemes = new Set(before.list.flatMap((entry) => Object.keys(entry)));
  const afterSchemes = new Set(after.list.flatMap((entry) => Object.keys(entry)));

  for (const scheme of afterSchemes) {
    if (!beforeSchemes.has(scheme)) {
      changes.push(
        makeChange({
          rule: 'operation.security-scheme-added',
          scope: SCOPE.SECURITY,
          severity: SEVERITY.BREAKING,
          location,
          message: `New security requirement "${scheme}" — callers without matching credentials are rejected.`,
        }),
      );
    }
  }

  for (const scheme of beforeSchemes) {
    if (!afterSchemes.has(scheme)) {
      changes.push(
        makeChange({
          rule: 'operation.security-scheme-removed',
          scope: SCOPE.SECURITY,
          severity: SEVERITY.ADDITIVE,
          location,
          message: `Security scheme "${scheme}" is no longer accepted here.`,
        }),
      );
    }
  }

  // A scope listed in the requirement is a permission the caller must hold.
  // Asking for more of them is a tightening; asking for fewer is a relaxation.
  for (const [scheme, beforeScopesRaw] of Object.entries(
    before.list.reduce((acc, entry) => ({ ...acc, ...entry }), {}),
  )) {
    const afterEntry = after.list.find((entry) => scheme in entry);
    if (!afterEntry) continue;
    const beforeScopes = Array.isArray(beforeScopesRaw) ? beforeScopesRaw : [];
    const afterScopes = Array.isArray(afterEntry[scheme]) ? afterEntry[scheme] : [];

    const added = afterScopes.filter((scope) => !beforeScopes.includes(scope));
    if (added.length > 0) {
      changes.push(
        makeChange({
          rule: 'operation.scope-added',
          scope: SCOPE.SECURITY,
          severity: SEVERITY.BREAKING,
          location,
          message: `Scheme "${scheme}" now also requires scope(s): ${added.join(', ')}.`,
          before: beforeScopes,
          after: afterScopes,
        }),
      );
    }

    const removed = beforeScopes.filter((scope) => !afterScopes.includes(scope));
    if (removed.length > 0) {
      changes.push(
        makeChange({
          rule: 'operation.scope-removed',
          scope: SCOPE.SECURITY,
          severity: SEVERITY.ADDITIVE,
          location,
          message: `Scheme "${scheme}" no longer requires scope(s): ${removed.join(', ')}.`,
          before: beforeScopes,
          after: afterScopes,
        }),
      );
    }
  }

  return changes;
}

export { HTTP_METHODS };
