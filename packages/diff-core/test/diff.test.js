import { describe, expect, it } from 'vitest';
import { diff, verdict, nextVersion, renderChangelog, parseSpec } from '../src/index.js';
import { baseSpec, clone } from './fixtures.js';

const rules = (result) => result.changes.map((change) => change.rule);

describe('identity and negatives', () => {
  it('reports no changes for identical documents', () => {
    const spec = baseSpec();
    const result = diff(spec, clone(spec));
    expect(result.changes).toHaveLength(0);
    expect(result.summary).toEqual({ total: 0, breaking: 0, additive: 0, cosmetic: 0 });
    expect(result.verdict.level).toBe('none');
  });

  it('ignores key order in objects', () => {
    const before = baseSpec();
    const after = baseSpec();
    after.paths['/orders'].get.parameters.reverse();
    const result = diff(before, after);
    expect(result.changes).toHaveLength(0);
  });

  it('treats description-only edits as cosmetic, not breaking', () => {
    const after = baseSpec();
    after.paths['/orders'].get.summary = 'List all orders';
    const result = diff(baseSpec(), after);
    expect(result.summary.breaking).toBe(0);
    expect(rules(result)).toContain('operation.summary-changed');
    expect(result.verdict.level).toBe('patch');
  });
});

describe('operations', () => {
  it('flags a removed operation as breaking', () => {
    const after = baseSpec();
    delete after.paths['/orders/{id}'].delete;
    const result = diff(baseSpec(), after);
    expect(result.summary.breaking).toBeGreaterThan(0);
    expect(rules(result)).toContain('operation.removed');
  });

  it('flags an added operation as additive', () => {
    const after = baseSpec();
    after.paths['/orders/{id}'].patch = { summary: 'Update', responses: { 200: { description: 'ok' } } };
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('operation.added');
    expect(result.summary.breaking).toBe(0);
    expect(result.verdict.level).toBe('minor');
  });

  it('flags deprecation as additive', () => {
    const after = baseSpec();
    after.paths['/orders/{id}'].delete.deprecated = true;
    expect(rules(diff(baseSpec(), after))).toContain('operation.deprecated');
  });
});

describe('parameters', () => {
  it('flags a new required query parameter as breaking', () => {
    const after = baseSpec();
    after.paths['/orders'].get.parameters.push({
      name: 'tenant',
      in: 'query',
      required: true,
      schema: { type: 'string' },
    });
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('parameter.added-required');
    expect(result.verdict.level).toBe('major');
  });

  it('flags a new optional parameter as additive', () => {
    const after = baseSpec();
    after.paths['/orders'].get.parameters.push({
      name: 'sort',
      in: 'query',
      required: false,
      schema: { type: 'string' },
    });
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('parameter.added-optional');
    expect(result.summary.breaking).toBe(0);
  });

  it('flags an existing parameter becoming required as breaking', () => {
    const after = baseSpec();
    after.paths['/orders'].get.parameters[0].required = true;
    expect(rules(diff(baseSpec(), after))).toContain('parameter.became-required');
  });

  it('flags removing a required path parameter as breaking', () => {
    const after = baseSpec();
    after.paths['/orders/{id}'].get.parameters = [];
    const result = diff(baseSpec(), after);
    const removal = result.changes.find((change) => change.rule === 'parameter.removed');
    expect(removal.severity).toBe('breaking');
  });

  it('detects a tightened parameter constraint', () => {
    const after = baseSpec();
    after.paths['/orders'].get.parameters[0].schema.maximum = 50;
    const result = diff(baseSpec(), after);
    const constraint = result.changes.find((change) => change.rule === 'schema.constraint-changed');
    expect(constraint.severity).toBe('breaking');
  });
});

describe('request body', () => {
  it('flags request body becoming required', () => {
    const after = baseSpec();
    after.paths['/orders'].post.requestBody.required = false;
    const before = baseSpec();
    // direction: optional -> required
    const result = diff(after, before);
    expect(rules(result)).toContain('request-body.became-required');
  });

  it('flags a removed request media type as breaking', () => {
    const after = baseSpec();
    delete after.paths['/orders'].post.requestBody.content['application/json'];
    after.paths['/orders'].post.requestBody.content['application/xml'] = { schema: { type: 'object' } };
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('request-body.media-type-removed');
    expect(rules(result)).toContain('request-body.media-type-added');
  });
});

describe('responses', () => {
  it('flags a removed response status as breaking', () => {
    const after = baseSpec();
    delete after.paths['/orders'].get.responses[400];
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('response.removed');
    expect(result.summary.breaking).toBeGreaterThan(0);
  });

  it('flags a newly documented response as additive', () => {
    const after = baseSpec();
    after.paths['/orders'].get.responses[429] = { description: 'Rate limited' };
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('response.added');
    expect(result.summary.breaking).toBe(0);
  });
});

describe('schemas', () => {
  it('flags a removed property as breaking', () => {
    const after = baseSpec();
    delete after.components.schemas.Order.properties.note;
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('schema.property-removed');
    expect(result.verdict.level).toBe('major');
  });

  it('flags an added optional property as additive', () => {
    const after = baseSpec();
    after.components.schemas.Order.properties.discount = { type: 'number' };
    const result = diff(baseSpec(), after);
    const change = result.changes.find((c) => c.rule === 'schema.property-added');
    expect(change.severity).toBe('additive');
  });

  it('flags an added required property as breaking', () => {
    const after = baseSpec();
    after.components.schemas.Order.required.push('total');
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('schema.required-added');
    expect(result.verdict.level).toBe('major');
  });

  it('flags a type change as breaking and stops descent', () => {
    const after = baseSpec();
    after.components.schemas.Order.properties.total.type = 'string';
    const result = diff(baseSpec(), after);
    const typeChange = result.changes.filter((c) => c.rule === 'schema.type-changed');
    expect(typeChange).toHaveLength(1);
  });

  it('flags enum value removal as breaking and addition as additive', () => {
    const after = baseSpec();
    after.components.schemas.Order.properties.status.enum = ['pending', 'paid', 'refunded'];
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('schema.enum-value-removed');
    expect(rules(result)).toContain('schema.enum-value-added');
  });

  it('flags nullable removal as breaking', () => {
    const after = baseSpec();
    delete after.components.schemas.Order.properties.note.nullable;
    expect(rules(diff(baseSpec(), after))).toContain('schema.nullable-removed');
  });

  it('flags format change as breaking', () => {
    const after = baseSpec();
    after.components.schemas.Order.properties.id.format = 'email';
    expect(rules(diff(baseSpec(), after))).toContain('schema.format-changed');
  });

  it('flags additionalProperties: false as breaking', () => {
    const after = baseSpec();
    after.components.schemas.Order.additionalProperties = false;
    expect(rules(diff(baseSpec(), after))).toContain('schema.additional-properties-forbidden');
  });

  it('follows local $ref without infinite recursion on cycles', () => {
    const before = baseSpec();
    const after = baseSpec();
    before.components.schemas.Node = {
      type: 'object',
      properties: { child: { $ref: '#/components/schemas/Node' }, label: { type: 'string' } },
    };
    after.components.schemas.Node = {
      type: 'object',
      properties: { child: { $ref: '#/components/schemas/Node' }, label: { type: 'integer' } },
    };
    const result = diff(before, after);
    expect(rules(result)).toContain('schema.type-changed');
  });

  it('detects a removed component schema as breaking', () => {
    const after = baseSpec();
    delete after.components.schemas.Address;
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('component-schema.removed');
    expect(result.verdict.level).toBe('major');
  });
});

describe('security', () => {
  it('flags newly required authentication as breaking', () => {
    const before = baseSpec();
    delete before.paths['/orders/{id}'].get.security;
    const result = diff(before, baseSpec());
    expect(rules(result)).toContain('operation.security-added');
    expect(result.verdict.level).toBe('major');
  });

  it('flags an additional required scope as breaking', () => {
    const after = baseSpec();
    after.paths['/orders'].post.security = [{ bearerAuth: ['orders:write', 'orders:admin'] }];
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('operation.scope-added');
    expect(result.verdict.level).toBe('major');
  });

  it('flags a dropped scope as additive', () => {
    const after = baseSpec();
    after.paths['/orders'].post.security = [{ bearerAuth: [] }];
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('operation.scope-removed');
    expect(result.summary.breaking).toBe(0);
  });

  it('flags authentication being removed entirely as additive', () => {
    const after = baseSpec();
    after.paths['/orders/{id}'].get.security = [];
    const result = diff(baseSpec(), after);
    expect(rules(result)).toContain('operation.security-removed');
    expect(result.summary.breaking).toBe(0);
  });

  it('stays silent when security is not declared on the new operation', () => {
    const after = baseSpec();
    delete after.paths['/orders/{id}'].get.security;
    const result = diff(baseSpec(), after);
    expect(result.changes.filter((c) => c.scope === 'security')).toHaveLength(0);
  });
});

describe('semver and changelog', () => {
  it('maps severities to the right bump', () => {
    expect(verdict([{ severity: 'breaking' }]).level).toBe('major');
    expect(verdict([{ severity: 'additive' }]).level).toBe('minor');
    expect(verdict([{ severity: 'cosmetic' }]).level).toBe('patch');
    expect(verdict([]).level).toBe('none');
  });

  it('computes the next version from the current one', () => {
    const result = nextVersion('2.3.1', [{ severity: 'additive' }]);
    expect(result.next).toBe('2.4.0');
    expect(nextVersion('2.3.1', [{ severity: 'breaking' }]).next).toBe('3.0.0');
    expect(nextVersion('2.3.1', [{ severity: 'cosmetic' }]).next).toBe('2.3.2');
    expect(nextVersion('2.3.1', []).next).toBe('2.3.1');
  });

  it('renders a changelog with grouped sections', () => {
    const result = diff(baseSpec(), (() => {
      const after = baseSpec();
      delete after.components.schemas.Order.properties.note;
      after.components.schemas.Order.properties.discount = { type: 'number' };
      return after;
    })());
    expect(result.changelog).toContain('## Orders API changelog');
    expect(result.changelog).toContain('💥 Breaking changes');
    expect(result.changelog).toContain('✨ Additive changes');
    expect(result.changelog).toContain('generated by SpecDrift');
  });

  it('returns deterministic output across runs', () => {
    const after = baseSpec();
    delete after.components.schemas.Order.properties.note;
    const first = diff(baseSpec(), after);
    const second = diff(baseSpec(), after);
    expect(JSON.stringify(first.changes)).toBe(JSON.stringify(second.changes));
  });
});

describe('parsing', () => {
  it('parses YAML input', () => {
    const yaml = `openapi: 3.0.3\ninfo:\n  title: Tiny\n  version: 1.0.0\npaths:\n  /ping:\n    get:\n      responses:\n        "200":\n          description: pong\n`;
    const spec = parseSpec(yaml, 'yaml');
    expect(spec.info.title).toBe('Tiny');
  });

  it('rejects an empty document with a clear message', () => {
    expect(() => parseSpec('   ', 'empty')).toThrow(/empty/);
  });

  it('rejects malformed JSON with a clear message', () => {
    expect(() => parseSpec('{ "openapi": ', 'broken')).toThrow(/invalid JSON/);
  });

  it('rejects a non-OpenAPI JSON object at diff time', () => {
    expect(() => diff({ hello: 'world' }, { hello: 'world' })).toThrow(/not recognisable/);
  });
});
