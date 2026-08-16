/**
 * The config seam — the entire product is "the package owns the *how*,
 * the consumer's config owns the *what*." (docs/BRIEF.md, First session §2)
 *
 * Designed against two real checks before the runner exists:
 * see examples/stilltrue.config.ts (GCPS board roster + BOC refresh).
 */

/** What a drift check found. Three outcomes, never two (BRIEF §First session 4). */
export type DriftOutcome =
  /** Live source still matches the expected file. */
  | 'pass'
  /** Facts no longer match — fail the build. A human fixes. */
  | 'rot'
  /** Source unreachable / timeout / WAF 403 — warn loudly, do NOT fail. */
  | 'error';

export interface DriftResult {
  name: string;
  outcome: DriftOutcome;
  /** Human-readable detail: the diff for `rot`, the cause for `error`. */
  messages: string[];
  /** Structured diff when outcome is `rot`, for the HTML report. */
  diff?: { expected: unknown; actual: unknown };
  checkedAt: string;
}

/**
 * One curated fact vs its live authoritative source.
 *
 * `source()` is the consumer's code — it may fetch+parse deterministically
 * or use an LLM to extract structure from a messy page; the package neither
 * knows nor cares. The comparison stays deterministic either way.
 */
export interface DriftCheck<T = unknown> {
  name: string;
  /** Fetch the live source and return structured data. Throw => `error`, never `rot`. */
  source: () => Promise<T>;
  /** Path to the curated expected file (JSON), or the expected value itself. */
  expect: string | T;
  /**
   * How to compare. A named built-in ('deep-equal', 'surnames', ...) or a
   * custom deterministic function returning mismatch messages ([] = pass).
   */
  compare?: string | ((expected: T, actual: T) => string[]);
}

export interface StilltrueConfig {
  drift?: DriftCheck<any>[];
  /** golden and verify are later phases — see docs/BRIEF.md build plan. */
  golden?: unknown;
  verify?: unknown;
}

/** Identity function for typed configs: `export default defineStilltrue({...})`. */
export function defineStilltrue(config: StilltrueConfig): StilltrueConfig {
  return config;
}
