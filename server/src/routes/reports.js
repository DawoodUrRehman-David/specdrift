import { Router } from 'express';
import { nanoid } from 'nanoid';
import { diff, SpecParseError } from '@specdrift/diff-core';
import { Report } from '../models/Report.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { diffRequestSchema, listQuerySchema, saveReportSchema } from '../middleware/schemas.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { diffLimiter, writeLimiter } from '../middleware/rateLimit.js';

export const reportsRouter = Router();

function runDiff(input) {
  try {
    return diff(input.before, input.after, { fromVersion: input.fromVersion });
  } catch (error) {
    if (error instanceof SpecParseError) {
      throw new ApiError(400, 'invalid_spec', error.message);
    }
    throw error;
  }
}

// POST /api/diff — stateless comparison
reportsRouter.post(
  '/diff',
  diffLimiter,
  validateBody(diffRequestSchema),
  asyncHandler(async (req, res) => {
    const result = runDiff(req.validated);
    res.json({ ok: true, data: result });
  }),
);

// POST /api/reports — persist and return a share link
reportsRouter.post(
  '/reports',
  writeLimiter,
  validateBody(saveReportSchema),
  asyncHandler(async (req, res) => {
    const result = runDiff(req.validated);
    const title = req.validated.title || `${result.meta.afterTitle ?? 'API'} · ${new Date().toISOString().slice(0, 10)}`;

    const report = await Report.create({
      slug: nanoid(10),
      title,
      summary: result.summary,
      verdict: result.verdict,
      meta: result.meta,
      changes: result.changes,
      changelog: result.changelog,
    });

    res.status(201).json({
      ok: true,
      data: { slug: report.slug, url: `/r/${report.slug}`, report: report.toJSON() },
    });
  }),
);

// GET /api/reports/:slug
reportsRouter.get(
  '/reports/:slug',
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    if (!/^[A-Za-z0-9_-]{6,24}$/.test(slug)) {
      throw new ApiError(400, 'invalid_slug', 'Share slugs are 6–24 URL-safe characters.');
    }
    const report = await Report.findOneAndUpdate(
      { slug },
      { $inc: { views: 1 } },
      { new: true },
    );
    if (!report) throw new ApiError(404, 'not_found', `No report with slug "${slug}".`);
    res.json({ ok: true, data: report.toJSON() });
  }),
);

// GET /api/reports — recent, paginated
reportsRouter.get(
  '/reports',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { limit, page } = req.validatedQuery;
    const [items, total] = await Promise.all([
      Report.find({}, { changes: 0, changelog: 0 })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Report.countDocuments(),
    ]);

    res.json({
      ok: true,
      data: {
        items: items.map(({ _id, ...rest }) => rest),
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    });
  }),
);
