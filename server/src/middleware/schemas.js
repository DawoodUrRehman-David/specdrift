import { z } from 'zod';

/**
 * A spec may arrive as a parsed object, a JSON string, or a YAML string.
 * We accept all three and let diff-core decide what is valid.
 */
const specInput = z.union([z.string().min(1), z.record(z.string(), z.any())]);

export const diffRequestSchema = z.object({
  before: specInput,
  after: specInput,
  fromVersion: z
    .string()
    .regex(/^v?\d+\.\d+\.\d+/, 'fromVersion must look like 1.2.3')
    .optional(),
});

export const saveReportSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  before: specInput,
  after: specInput,
  fromVersion: z
    .string()
    .regex(/^v?\d+\.\d+\.\d+/, 'fromVersion must look like 1.2.3')
    .optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
