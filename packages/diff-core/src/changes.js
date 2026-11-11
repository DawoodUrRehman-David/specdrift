export const SEVERITY = Object.freeze({
  BREAKING: 'breaking',
  ADDITIVE: 'additive',
  COSMETIC: 'cosmetic',
});

export const SEVERITY_ORDER = Object.freeze({
  [SEVERITY.BREAKING]: 0,
  [SEVERITY.ADDITIVE]: 1,
  [SEVERITY.COSMETIC]: 2,
});

export const SCOPE = Object.freeze({
  INFO: 'info',
  SERVER: 'server',
  SECURITY: 'security',
  PATH: 'path',
  OPERATION: 'operation',
  PARAMETER: 'parameter',
  REQUEST_BODY: 'request-body',
  RESPONSE: 'response',
  SCHEMA: 'schema',
});

export function makeChange({ rule, scope, severity, location, message, before, after }) {
  return {
    rule,
    scope,
    severity,
    location,
    message,
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  };
}

export const isBreaking = (change) => change.severity === SEVERITY.BREAKING;
