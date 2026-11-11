# @specdrift/diff-core

Framework-agnostic OpenAPI diff engine. Every change classified as **breaking**, **additive** or
**cosmetic**, plus the semver verdict and a Markdown changelog. Zero runtime dependencies apart from
a YAML parser, works in Node and in the browser.

```bash
npm i @specdrift/diff-core
```

```js
import { diff } from '@specdrift/diff-core';

const result = diff(before, after, { fromVersion: '2.3.1' });

result.summary;    // { total, breaking, additive, cosmetic }
result.verdict;    // { level: 'major' | 'minor' | 'patch' | 'none', next, reason }
result.changes;    // [{ rule, scope, severity, location, message, before?, after? }]
result.changelog;  // Markdown
```

`before` and `after` may be objects, JSON strings, or YAML strings.

## CLI

```bash
npx specdrift old.yaml new.yaml
npx specdrift old.json new.json --fail-on breaking --quiet   # exit 1 on breakage
npx specdrift old.json new.json --json --from-version 2.3.1
```

Exit codes: `0` clean, `1` threshold hit, `2` usage or parse error.

## Notes

- Local `#/components/...` `$ref` pointers are resolved before comparison, cycle-safe.
- Output is deterministic: changes are sorted by severity, then location, then rule.
- 38 rules; the full table lives in the repository's `docs/rules.md`.

MIT © Dawood Ur Rehman
