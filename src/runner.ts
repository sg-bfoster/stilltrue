import type { CheckContext, DriftCheck, DriftResult, StilltrueConfig } from './config.ts';
import { resolveCompare } from './compare.ts';

export interface RunDriftOptions {
  /** Run only checks whose name is in this list. */
  only?: string[];
  /** Directory the config file was loaded from (data paths resolve here). */
  configDir: string;
}

export async function runDriftCheck(check: DriftCheck<any, any>, configDir: string): Promise<DriftResult> {
  const warnings: string[] = [];
  const ctx: CheckContext = { warn: (m) => warnings.push(m), configDir };
  const started = Date.now();
  const done = (outcome: DriftResult['outcome'], messages: string[]): DriftResult => ({
    name: check.name,
    outcome,
    messages,
    warnings,
    checkedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
  });

  let expected: unknown;
  try {
    expected = typeof check.expect === 'function' ? await (check.expect as Function)(ctx) : check.expect;
  } catch (err) {
    // A broken expectation is consumer misconfiguration, not source rot or
    // source outage — surface it as `error` so CI warns loudly.
    return done('error', [`expect failed: ${err instanceof Error ? err.message : String(err)}`]);
  }

  let actual: unknown;
  try {
    actual = await check.source(ctx);
  } catch (err) {
    return done('error', [`source failed: ${err instanceof Error ? err.message : String(err)}`]);
  }

  try {
    const mismatches = resolveCompare(check.compare)(expected, actual);
    return mismatches.length ? done('rot', mismatches) : done('pass', []);
  } catch (err) {
    return done('error', [`compare failed: ${err instanceof Error ? err.message : String(err)}`]);
  }
}

export async function runDrift(config: StilltrueConfig, options: RunDriftOptions): Promise<DriftResult[]> {
  const checks = (config.drift ?? []).filter(
    (c) => !options.only || options.only.includes(c.name),
  );
  const results: DriftResult[] = [];
  for (const check of checks) {
    results.push(await runDriftCheck(check, options.configDir));
  }
  return results;
}
