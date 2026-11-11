import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'bin', 'specdrift.js');
const repoRoot = join(here, '..', '..', '..');
const beforeSpec = join(repoRoot, 'examples', 'orders-v2.3.1.json');
const afterSpec = join(repoRoot, 'examples', 'orders-v3.0.0.json');

function run(args) {
  try {
    const stdout = execFileSync('node', [cli, ...args], { encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

describe('CLI exit codes', () => {
  it('exits 1 when a breaking change exists at the default threshold', () => {
    const result = run([beforeSpec, afterSpec, '--quiet']);
    expect(result.code).toBe(1);
  });

  it('exits 0 with --fail-on none (report only)', () => {
    expect(run([beforeSpec, afterSpec, '--fail-on', 'none', '--quiet']).code).toBe(0);
  });

  it('exits 0 for identical documents', () => {
    expect(run([beforeSpec, beforeSpec, '--quiet']).code).toBe(0);
  });

  it('exits 2 for a missing file', () => {
    expect(run([beforeSpec, '/tmp/definitely-missing-spec.json', '--quiet']).code).toBe(2);
  });

  it('exits 2 for bad usage', () => {
    expect(run(['only-one-file.json']).code).toBe(2);
  });

  it('exits 2 for an unknown flag', () => {
    expect(run([beforeSpec, afterSpec, '--nope']).code).toBe(2);
  });
});

describe('CLI output', () => {
  it('prints a changelog and verdict', () => {
    const { code, stdout } = run([beforeSpec, afterSpec]);
    expect(code).toBe(1);
    expect(stdout).toContain('Orders API changelog');
    expect(stdout).toContain('Suggested release: major');
  });

  it('emits parseable JSON with --json', () => {
    const { stdout } = run([beforeSpec, afterSpec, '--json']);
    const parsed = JSON.parse(stdout);
    expect(parsed.summary.breaking).toBeGreaterThan(0);
    expect(parsed.verdict.level).toBe('major');
  });

  it('computes the next version from --from-version', () => {
    const { stdout } = run([beforeSpec, afterSpec, '--json', '--from-version', '2.3.1']);
    expect(JSON.parse(stdout).verdict.next).toBe('3.0.0');
  });

  it('prints usage with --help and exits 0', () => {
    const { code, stdout } = run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
  });
});
