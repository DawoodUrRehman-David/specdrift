#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { diff } from '../src/index.js';

const USAGE = `specdrift — compare two OpenAPI documents and classify breaking changes

Usage
  specdrift <before> <after> [options]

Options
  --json                 Print the full result as JSON
  --changelog            Print only the Markdown changelog (default when not --json)
  --fail-on <severity>   Exit 1 when a change at this level or worse exists
                         values: breaking | additive | cosmetic | none  (default: breaking)
  --from-version <v>     Current released version, to compute the next one (e.g. 2.3.1)
  --quiet                Print nothing; rely on exit code (CI friendly)
  -h, --help             Show this help

Exit codes
  0  no change at or above --fail-on
  1  change at or above --fail-on detected
  2  usage or parse error
`;

const RANK = { cosmetic: 1, additive: 2, breaking: 3, none: 0 };

function parseArgs(argv) {
  const options = { json: false, changelog: false, quiet: false, failOn: 'breaking', fromVersion: null };
  const files = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') return { help: true, options, files };
    else if (arg === '--json') options.json = true;
    else if (arg === '--changelog') options.changelog = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--fail-on') options.failOn = argv[++i];
    else if (arg.startsWith('--fail-on=')) options.failOn = arg.split('=')[1];
    else if (arg === '--from-version') options.fromVersion = argv[++i];
    else if (arg.startsWith('--from-version=')) options.fromVersion = arg.split('=')[1];
    else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    else files.push(arg);
  }
  return { help: false, options, files };
}

function readSpecFile(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`file not found: ${path}`);
  return readFileSync(absolute, 'utf8');
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`specdrift: ${error.message}\n`);
    console.error(USAGE);
    return 2;
  }

  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }

  if (parsed.files.length !== 2) {
    console.error('specdrift: expected exactly two documents (before and after)\n');
    console.error(USAGE);
    return 2;
  }

  if (!(parsed.options.failOn in RANK)) {
    console.error(`specdrift: --fail-on must be one of ${Object.keys(RANK).join(', ')}`);
    return 2;
  }

  let result;
  try {
    const [beforePath, afterPath] = parsed.files;
    result = diff(readSpecFile(beforePath), readSpecFile(afterPath), {
      fromVersion: parsed.options.fromVersion ?? undefined,
    });
  } catch (error) {
    console.error(`specdrift: ${error.message}`);
    return 2;
  }

  if (parsed.options.json) {
    if (!parsed.options.quiet) console.log(JSON.stringify(result, null, 2));
  } else if (!parsed.options.quiet) {
    console.log(result.changelog);
    const { summary, verdict } = result;
    console.log('');
    console.log(
      `Summary: ${summary.total} change(s) — ${summary.breaking} breaking, ${summary.additive} additive, ${summary.cosmetic} cosmetic.`,
    );
    console.log(
      `Suggested release: ${verdict.level}${verdict.next ? ` → ${verdict.next}` : ''} (${verdict.reason})`,
    );
  }

  const worst = result.changes.reduce(
    (acc, change) => Math.max(acc, RANK[change.severity] ?? 0),
    0,
  );
  const threshold = RANK[parsed.options.failOn];
  // `--fail-on none` means report-only: nothing is severe enough to fail the build.
  if (threshold === RANK.none) return 0;
  return worst >= threshold ? 1 : 0;
}

process.exit(main());
