/**
 * The config seam — the package owns the *how*, the consumer's config owns
 * the *what*. Designed against the real production check it replaces
 * (bfoster-services scripts/check-school-board-drift.js): fetch pages into a
 * text corpus, assert curated markers still appear, tolerate partial fetch
 * failures with warnings, and never conflate "facts changed" with "source
 * unreachable".
 */

/** Three outcomes, never two (docs/BRIEF.md, First session §4). */
export type DriftOutcome =
  /** Live source still matches the curated facts. */
  | 'pass'
  /** Facts no longer match — fail the build. A human fixes. */
  | 'rot'
  /** Source unreachable / timeout / WAF 403 — warn loudly, do NOT fail. */
  | 'error';

export interface DriftResult {
  name: string;
  outcome: DriftOutcome;
  /** One issue per entry: the mismatches for `rot`, the cause for `error`. */
  messages: string[];
  /** Non-fatal notes (e.g. one of several pages unreachable). */
  warnings: string[];
  checkedAt: string;
  durationMs: number;
}

/** Passed to consumer `source`/`expect` functions. */
export interface CheckContext {
  /** Record a non-fatal problem (partial fetch failure, odd markup, …). */
  warn: (message: string) => void;
  /** Absolute directory of the loaded config file — resolve data paths from here. */
  configDir: string;
}

/**
 * Deterministic comparison: returns mismatch messages, [] = pass.
 * Built-ins: 'contains-all' (expected: string[] markers, actual: corpus
 * string, case-insensitive) and 'deep-equal'.
 */
export type CompareFn<E, A> = (expected: E, actual: A) => string[];
export type Compare<E, A> = 'contains-all' | 'deep-equal' | CompareFn<E, A>;

/**
 * One curated fact-set vs its live authoritative source.
 *
 * `source()` is consumer code — deterministic fetch+parse or LLM extraction,
 * the package neither knows nor cares; a throw means outcome `error`, never
 * `rot`. The comparison is always deterministic.
 */
export interface DriftCheck<E = unknown, A = unknown> {
  name: string;
  /** Fetch the live source. Throw => `error`. */
  source: (ctx: CheckContext) => Promise<A>;
  /** The curated expectation: a value, or a function deriving it (e.g. from a data file). */
  expect: E | ((ctx: CheckContext) => E | Promise<E>);
  /** Defaults to 'deep-equal'. */
  compare?: Compare<E, A>;
}

export interface StilltrueConfig {
  drift?: DriftCheck<any, any>[];
  /** golden and verify are later phases — see docs/BRIEF.md build plan. */
  golden?: unknown;
  verify?: unknown;
}

/** Identity function for typed configs: `export default defineStilltrue({...})`. */
export function defineStilltrue(config: StilltrueConfig): StilltrueConfig {
  return config;
}
