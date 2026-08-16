/**
 * `verify` — an ordered, short-circuiting acceptance pipeline for AI (or any
 * generator) output. Modeled on the P9 level-rejection contract, generalized
 * with the review.js production doctrine:
 *
 * - Stages run in a fixed order and stop at the first rejection; later
 *   stages may assume earlier ones passed. (P9)
 * - Rejection is structured and machine-readable — `{ stage, messages[] }`,
 *   one issue per entry — designed to be fed back to the generator. (P9)
 * - The judge is pluggable: a Zod parse, a deterministic validator, or an
 *   LLM. The pipeline neither knows nor cares. (P9 + review.js)
 * - A stage that THROWS is an infrastructure failure, not a verdict.
 *   `failPolicy: 'open'` (default) warns and continues — a judge outage must
 *   never block the app; `'closed'` treats it as rejection. (review.js)
 * - A rejecting stage may supply a `revision` — a corrected value ready to
 *   use (review.js's judge rewrite). The pipeline stops there; the result
 *   carries the revision and is marked `revised`.
 * - Tiers: `inline` stages are cheap and run everywhere; `ci` stages are
 *   expensive (simulations, live fetches) and run only when asked. (P9)
 */
import type { ZodType } from 'zod';

export type StageOutcome<T> =
  /** Pass. `value` optionally replaces the input for later stages (e.g. a parse). */
  | { ok: true; value?: T }
  /** Reject: one issue per message. `revision` is an optional corrected value. */
  | { ok: false; messages: string[]; revision?: T };

export interface StageContext {
  warn: (message: string) => void;
  /** Which tier this run was invoked with. */
  tier: 'inline' | 'ci';
}

export interface VerifyStage<T = unknown> {
  name: string;
  check: (input: T, ctx: StageContext) => StageOutcome<T> | Promise<StageOutcome<T>>;
  /**
   * What a THROWN stage means. 'open' (default): infrastructure failure —
   * warn and continue with the input unchanged. 'closed': reject.
   */
  failPolicy?: 'open' | 'closed';
  /** Abort the stage after this long; the timeout follows failPolicy. */
  timeoutMs?: number;
  /** 'inline' (default) runs always; 'ci' runs only with `{ tier: 'ci' }`. */
  tier?: 'inline' | 'ci';
}

export interface VerifyResult<T> {
  ok: boolean;
  /** First failing stage; absent on success. */
  stage?: string;
  /** The failing stage's messages only — not cumulative (P9 §2). */
  messages: string[];
  /** Final value: the (possibly transformed) input, or the revision. */
  value: T;
  /** True when a rejecting stage supplied a corrected value. */
  revised: boolean;
  /** Fail-open infrastructure failures and stage warnings. */
  warnings: string[];
  stagesRun: string[];
}

export interface RunVerifyOptions {
  /** 'inline' (default) skips `tier: 'ci'` stages; 'ci' runs everything. */
  tier?: 'inline' | 'ci';
}

async function runStage<T>(
  stage: VerifyStage<T>,
  input: T,
  ctx: StageContext,
): Promise<StageOutcome<T>> {
  const run = Promise.resolve(stage.check(input, ctx));
  if (!stage.timeoutMs) return run;
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`stage timeout after ${stage.timeoutMs}ms`)), stage.timeoutMs);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function runVerify<T>(
  stages: VerifyStage<T>[],
  input: T,
  options: RunVerifyOptions = {},
): Promise<VerifyResult<T>> {
  const tier = options.tier ?? 'inline';
  const warnings: string[] = [];
  const stagesRun: string[] = [];
  const ctx: StageContext = { warn: (m) => warnings.push(m), tier };

  let value = input;
  for (const stage of stages) {
    if ((stage.tier ?? 'inline') === 'ci' && tier !== 'ci') continue;
    stagesRun.push(stage.name);

    let outcome: StageOutcome<T>;
    try {
      outcome = await runStage(stage, value, ctx);
    } catch (err) {
      const message = `${stage.name}: ${err instanceof Error ? err.message : String(err)}`;
      if ((stage.failPolicy ?? 'open') === 'open') {
        warnings.push(`fail-open: ${message}`);
        continue;
      }
      return { ok: false, stage: stage.name, messages: [message], value, revised: false, warnings, stagesRun };
    }

    if (!outcome.ok) {
      const revised = outcome.revision !== undefined;
      return {
        ok: false,
        stage: stage.name,
        messages: outcome.messages,
        value: revised ? (outcome.revision as T) : value,
        revised,
        warnings,
        stagesRun,
      };
    }
    if (outcome.value !== undefined) value = outcome.value;
  }

  return { ok: true, messages: [], value, revised: false, warnings, stagesRun };
}

/**
 * Stage helper: a P9-style `parse_schema` gate from a Zod schema. On success
 * the parsed (typed, defaulted, stripped) value replaces the input for later
 * stages; on failure, one message per Zod issue with its path.
 */
export function zodStage<T>(name: string, schema: ZodType<T>): VerifyStage<any> {
  return {
    name,
    check: (input) => {
      const parsed = schema.safeParse(input);
      if (parsed.success) return { ok: true, value: parsed.data };
      return {
        ok: false,
        messages: parsed.error.issues.map(
          (i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`,
        ),
      };
    },
  };
}

/**
 * Format a rejection as generator feedback — stage id + messages verbatim as
 * bullets (P9 §3: preserve strings so distances and ids stay fixable).
 */
export function formatRejection(result: VerifyResult<any>): string {
  return `Rejected at stage "${result.stage}":\n${result.messages.map((m) => `- ${m}`).join('\n')}`;
}

export interface GenerateVerifiedOptions<T> {
  /** Produce a candidate. On retries, `feedback` is the previous rejection. */
  generate: (feedback?: VerifyResult<T>) => T | Promise<T>;
  stages: VerifyStage<T>[];
  /**
   * Total attempts, default 2 (P9 §3: one automatic retry; more wastes
   * tokens — after the cap, fall back or ask a human, don't loop).
   */
  attempts?: number;
  tier?: 'inline' | 'ci';
}

/**
 * The generate → verify → feed-back-and-retry loop as a first-class helper.
 * Returns the first passing result, or the LAST rejection after the cap —
 * never silently discards errors (P9 §3.4).
 */
export async function generateVerified<T>(
  options: GenerateVerifiedOptions<T>,
): Promise<VerifyResult<T> & { attempts: number }> {
  const attempts = Math.max(1, options.attempts ?? 2);
  let last: VerifyResult<T> | undefined;
  for (let i = 0; i < attempts; i++) {
    const candidate = await options.generate(last);
    last = await runVerify(options.stages, candidate, { tier: options.tier });
    if (last.ok) return { ...last, attempts: i + 1 };
  }
  return { ...(last as VerifyResult<T>), attempts };
}
