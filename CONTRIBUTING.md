# Contributing

The most useful contribution is a **rule** — a breaking change this tool misses, or one it
misclassifies. Rules are the product; everything else is packaging.

## Reporting a missed change

Open an issue with the "Missed breaking change" template and include:

1. The smallest `before` and `after` fragments that reproduce it (a schema is enough, no full spec needed).
2. What SpecDrift currently reports.
3. Why an existing client would break.

## Adding a rule

1. Add the comparison in `packages/diff-core/src/schema-diff.js` (schemas) or `paths-diff.js`
   (operations, parameters, bodies, responses, security).
2. Emit it through `makeChange()` and pick `scope`, `severity`, `location`, and a message that says
   *what happens to the client*, not just what changed.
3. Add a test in `packages/diff-core/test/diff.test.js`:
   - one case where the rule fires with the expected severity
   - one **negative** case proving the rule does not fire on an unchanged document
4. Add the row to `docs/rules.md`.

A rule without a negative test will be rejected — a noisy diff tool is worse than no diff tool.

## Local setup

```bash
npm install
docker compose up -d mongo   # for API tests
npm test                     # engine + API
npm run dev                  # UI on :5173, API on :4000
```

## Style

- ES modules, no build step for `diff-core`
- No new runtime dependency in `diff-core` without a strong reason; the zero-dep property is deliberate
- Messages are sentences about client impact, not enum values

## Scope

Out of scope: OpenAPI 2.0-specific structures, external `$ref` fetching, automatic spec rewriting.
