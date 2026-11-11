import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Report } from '../src/models/Report.js';
import { before as specBefore, after as specAfter } from './samples.js';

let app;

const TEST_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/specdrift_test';

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    throw new Error(
      `Cannot reach MongoDB at ${TEST_URI}. Start one with "docker compose up -d mongo" ` +
        `or set MONGODB_URI. Original error: ${error.message}`,
    );
  }
  app = createApp();
}, 30_000);

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Report.deleteMany({});
});

describe('health', () => {
  it('reports service and database state', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.db).toBe('connected');
  });
});

describe('POST /api/diff', () => {
  it('returns a breaking verdict for a breaking change', async () => {
    const res = await request(app).post('/api/diff').send({ before: specBefore, after: specAfter });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.verdict.level).toBe('major');
    expect(res.body.data.summary.breaking).toBeGreaterThan(0);
    expect(res.body.data.changelog).toContain('Payments API changelog');
  });

  it('accepts JSON strings and YAML strings', async () => {
    const yaml = `openapi: 3.0.3\ninfo:\n  title: Tiny\n  version: 1.0.0\npaths:\n  /ping:\n    get:\n      responses:\n        "200":\n          description: pong\n`;
    const res = await request(app)
      .post('/api/diff')
      .send({ before: yaml, after: JSON.stringify(specBefore) });
    expect(res.status).toBe(200);
    expect(res.body.data.changes.length).toBeGreaterThan(0);
  });

  it('returns a minor verdict for additive-only changes', async () => {
    const additive = JSON.parse(JSON.stringify(specBefore));
    additive.paths['/refunds'] = { get: { responses: { 200: { description: 'ok' } } } };
    const res = await request(app).post('/api/diff').send({ before: specBefore, after: additive });
    expect(res.body.data.verdict.level).toBe('minor');
    expect(res.body.data.summary.breaking).toBe(0);
  });

  it('returns a patch verdict with no changes', async () => {
    const res = await request(app).post('/api/diff').send({ before: specBefore, after: specBefore });
    expect(res.body.data.verdict.level).toBe('none');
    expect(res.body.data.summary.total).toBe(0);
  });

  it('computes the next version when fromVersion is supplied', async () => {
    const res = await request(app)
      .post('/api/diff')
      .send({ before: specBefore, after: specAfter, fromVersion: '1.4.0' });
    expect(res.body.data.verdict.next).toBe('2.0.0');
  });

  it('rejects a malformed document with 400 and a readable message', async () => {
    const res = await request(app).post('/api/diff').send({ before: '{"openapi":', after: specAfter });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('invalid_spec');
    expect(res.body.error.message).toMatch(/invalid JSON/);
  });

  it('rejects a JSON blob that is not an OpenAPI document', async () => {
    const res = await request(app).post('/api/diff').send({ before: { hello: 'world' }, after: specAfter });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not recognisable/);
  });

  it('rejects a missing field with validation details', async () => {
    const res = await request(app).post('/api/diff').send({ before: specBefore });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('rejects a bad fromVersion format', async () => {
    const res = await request(app)
      .post('/api/diff')
      .send({ before: specBefore, after: specAfter, fromVersion: 'latest' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });
});

describe('POST /api/reports', () => {
  it('persists a report and returns a share link', async () => {
    const res = await request(app)
      .post('/api/reports')
      .send({ title: 'Payments 2.0 review', before: specBefore, after: specAfter });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(res.body.data.url).toBe(`/r/${res.body.data.slug}`);
    expect(res.body.data.report.verdict.level).toBe('major');
    expect(await Report.countDocuments()).toBe(1);
  });

  it('generates a title when none is given', async () => {
    const res = await request(app).post('/api/reports').send({ before: specBefore, after: specAfter });
    expect(res.body.data.report.title).toContain('Payments API');
  });

  it('never collides on slug for consecutive saves', async () => {
    const first = await request(app).post('/api/reports').send({ before: specBefore, after: specAfter });
    const second = await request(app).post('/api/reports').send({ before: specBefore, after: specAfter });
    expect(first.body.data.slug).not.toBe(second.body.data.slug);
  });

  it('rejects an invalid spec', async () => {
    const res = await request(app).post('/api/reports').send({ before: 'not: openapi', after: specAfter });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_spec');
  });
});

describe('GET /api/reports/:slug', () => {
  it('returns the stored report and increments views', async () => {
    const created = await request(app).post('/api/reports').send({ before: specBefore, after: specAfter });
    const { slug } = created.body.data;

    const first = await request(app).get(`/api/reports/${slug}`);
    expect(first.status).toBe(200);
    expect(first.body.data.slug).toBe(slug);
    expect(first.body.data.views).toBe(1);
    expect(first.body.data.changes.length).toBeGreaterThan(0);

    const second = await request(app).get(`/api/reports/${slug}`);
    expect(second.body.data.views).toBe(2);
  });

  it('404s on an unknown slug', async () => {
    const res = await request(app).get('/api/reports/doesnotexist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('400s on a malformed slug with path traversal characters', async () => {
    const res = await request(app).get('/api/reports/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_slug');
  });
});

describe('GET /api/reports', () => {
  it('paginates recent reports and omits heavy fields', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/api/reports').send({ title: `Run ${i}`, before: specBefore, after: specAfter });
    }
    const res = await request(app).get('/api/reports?limit=2&page=1');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.hasMore).toBe(true);
    expect(res.body.data.items[0].changes).toBeUndefined();
    expect(res.body.data.items[0].changelog).toBeUndefined();
  });

  it('clamps out-of-range pagination to validation errors', async () => {
    const res = await request(app).get('/api/reports?limit=999');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });
});

describe('unknown routes', () => {
  it('returns a structured 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
