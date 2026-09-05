/**
 * supportStage — does this SOURCE actually support this CLAIM?
 *
 * The verify half of this package shipped one ready-made stage (`zodStage`, a
 * schema check) and otherwise handed callers an interface: implement
 * VerifyStage, understand StageOutcome, write your own judge — prompt, response
 * schema, parsing, guard. That is a lot of scaffolding in front of the single
 * question people arrive here to ask.
 *
 * This is that scaffolding, shipped. You bring a function that calls a model;
 * everything else has a default. stilltrue still ships no AI, no key and no
 * provider dependency — the judge is a function, and this file never learns
 * what is behind it.
 *
 * See docs/SUPPORT_STAGE_PLAN.md for the measurements that produced the
 * defaults below. They are not taste; each one was paid for.
 */

import type { VerifyStage, StageOutcome } from './verify.ts';

export type Verdict = 'supported' | 'not_supported' | 'cant_tell';

export interface SupportInput {
  claim: string;
  source: string;
}

export interface SupportJudgement {
  verdict: Verdict;
  reasoning: string;
  /** The sentence that decided it, quoted from the source. */
  evidence: string | null;
  /** For not_supported only: the sentence that says otherwise, verbatim. */
  contradiction: string | null;
}

/** What the stage puts in `result.value`: the input plus what the judge said. */
export interface SupportResult extends SupportInput, SupportJudgement {
  /**
   * Why the verdict is what it is, when the guard intervened:
   * - `verified` — a contradicting quote was found in the source
   * - `no-contradiction-quoted` — none offered, verdict downgraded
   * - `quote-not-in-source` — one offered but not present, verdict downgraded
   * - `null` — the guard had no opinion (verdict was not not_supported)
   */
  guard: 'verified' | 'no-contradiction-quoted' | 'quote-not-in-source' | null;
}

export interface JudgeRequest {
  system: string;
  user: string;
  /**
   * The response shape, for providers that support constrained decoding. Hand
   * this straight to the provider where you can: a grammar-enforced enum makes
   * an out-of-band verdict unrepresentable rather than merely unlikely, which
   * is a stronger guarantee than asking politely for JSON.
   */
  schema: typeof SUPPORT_SCHEMA;
}

/** Return parsed JSON, or the raw string — both are accepted. */
export type Judge = (req: JudgeRequest) => unknown | Promise<unknown>;

export interface SupportStageOptions {
  judge: Judge;
  name?: string;
  /**
   * Minimum contiguous run, in characters, that a contradiction quote must
   * share with the source.
   *
   * 24 is MEASURED, not chosen, and measured on ONE corpus — civic notices,
   * fee schedules and ordinances. Contradictions written in prose ran 76-96
   * characters, but a contradicting line in a fee table ("Seniors 65 and over
   * $1.00.") is only 26, and a first guess of 40 silently discarded those.
   * Treat it as a starting point for your corpus, not a tuned constant.
   */
  minRun?: number;
  /**
   * Require a not_supported verdict to quote the contradicting sentence, and
   * downgrade to cant_tell when it cannot. Default true.
   *
   * Off restores naive behaviour, which is sometimes what you want — this
   * package should not dictate policy to a caller whose corpus differs.
   */
  requireContradiction?: boolean;
  /** How to treat cant_tell. 'reject' (default) or 'warn' and pass. */
  treatCantTellAs?: 'reject' | 'warn';
  /** Replace the shipped judge prompt entirely. */
  system?: string;
  /** Default 'open': a judge outage warns rather than rejects. */
  failPolicy?: 'open' | 'closed';
  timeoutMs?: number;
  tier?: 'inline' | 'ci';
}

/**
 * The shipped judge prompt.
 *
 * The line about qualification is load-bearing rather than decorative.
 * Measured 2026-09-04 without it: adding two lines to a source that never
 * mention the claim flipped a verdict from supported to not_supported — three
 * runs each way, so not sampling noise — on a local model where a frontier
 * model stayed stable. A package promising engine-agnostic verification has to
 * survive the weaker engine, so the instruction ships by default.
 */
export const SUPPORT_SYSTEM = `You are a strict fact-check judge. Decide whether the SOURCE supports the CLAIM using ONLY the source text — no outside knowledge, no charitable guessing.
Verdicts:
- "supported": the source affirmatively supports the claim.
- "not_supported": the source contradicts the claim or asserts something incompatible with it.
- "cant_tell": the source does not address the claim, or addresses it only partially. Silence is NOT support.
A qualification is not a contradiction. If the source substantially supports the claim but adds an exception, a carve-out or a condition, it has NOT said otherwise — do not rule not_supported. Reserve not_supported for a source that asserts something the claim cannot be true alongside.
To rule "not_supported" you MUST fill "contradiction" with the exact sentence from the source that says otherwise, copied verbatim. If no such sentence exists, you may not use that verdict.
Return STRICT JSON only:
{"verdict":"supported"|"not_supported"|"cant_tell","reasoning":"<one or two plain sentences>","evidence":"<short verbatim quote from the source that decided it, or null>","contradiction":"<verbatim sentence that contradicts the claim, or null>"}`;

/** JSON Schema for the judgement, for providers that constrain decoding. */
export const SUPPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['supported', 'not_supported', 'cant_tell'] },
    reasoning: { type: 'string' },
    evidence: { type: ['string', 'null'] },
    contradiction: { type: ['string', 'null'] },
  },
  required: ['verdict', 'reasoning', 'evidence', 'contradiction'],
} as const;

/**
 * SOURCE first, CLAIM last — deliberately.
 *
 * Prefix caching is an exact-token match, so putting the long, stable source
 * ahead of the short, variable claim means a second claim checked against the
 * SAME source reuses the cached prefix. That is the obvious next thing a user
 * does. Claim-first diverges at token one and pays full prefill every time.
 */
export function supportPrompt(input: SupportInput): string {
  return `SOURCE:\n${input.source}\n\nCLAIM:\n${input.claim}`;
}

const VERDICTS: Verdict[] = ['supported', 'not_supported', 'cant_tell'];

/** Whitespace and quote-style differences must not decide a match. */
function normalise(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s‘’“”"']+/g, ' ')
    .trim();
}

/**
 * Longest run of `needle` that appears contiguously in `haystack`.
 *
 * Whole-string matching was tried first and was too strict: a judge quoted
 * "dogs must remain on a leash ..." where the source read "Dogs are permitted
 * in all county parks BUT must remain on a leash ...". Tidying a quote's
 * subject into a grammatical sentence is what careful writers do, and exact
 * matching discarded a correct verdict for it. A long contiguous run still
 * proves the judge was reading real text — it cannot invent two dozen
 * consecutive characters that happen to be in the source.
 */
export function longestRun(needle: string, haystack: string): number {
  let best = 0;
  for (let i = 0; i < needle.length; i += 1) {
    if (needle.length - i <= best) break; // no run from here can beat `best`
    let lo = best + 1;
    let hi = needle.length - i;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (haystack.includes(needle.slice(i, i + mid))) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
  }
  return best;
}

/**
 * Make "not supported" earn itself.
 *
 * That verdict tells a reader the source SAYS OTHERWISE, which is a strong
 * claim and the one most worth being wrong about. This only ever DOWNGRADES:
 * a missing quote is evidence of nothing except a missing quote, so nothing is
 * ever promoted to supported on its strength.
 */
export function guardJudgement(
  judgement: SupportJudgement,
  source: string,
  minRun: number,
): SupportResult['guard'] {
  if (judgement.verdict !== 'not_supported') return null;
  const quote = normalise(judgement.contradiction);
  // Below a floor, a "quote" is not evidence — "not", "free" and "$14" would
  // all match almost any source.
  if (quote.length < Math.min(15, minRun)) return 'no-contradiction-quoted';
  return longestRun(quote, normalise(source)) >= minRun ? 'verified' : 'quote-not-in-source';
}

function parseJudgement(raw: unknown): SupportJudgement {
  let obj: any = raw;
  if (typeof raw === 'string') {
    // Providers that cannot constrain decoding often wrap JSON in prose or a
    // fenced block. Recover the object rather than failing the whole stage.
    try {
      obj = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('judge returned no JSON');
      obj = JSON.parse(match[0]);
    }
  }
  if (!obj || typeof obj !== 'object') throw new Error('judge returned no object');
  return {
    // Coerce, do not trust: only a grammar-constrained provider guarantees the
    // enum, and an unrecognised verdict must not become a confident answer.
    verdict: VERDICTS.includes(obj.verdict) ? obj.verdict : 'cant_tell',
    reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
    evidence: typeof obj.evidence === 'string' ? obj.evidence : null,
    contradiction: typeof obj.contradiction === 'string' ? obj.contradiction : null,
  };
}

/**
 * A ready-made verify stage that asks whether a source supports a claim.
 *
 * ```js
 * const stage = supportStage({ judge: ({ system, user }) => callMyModel(system, user) });
 * const result = await runVerify([stage], { claim, source });
 * ```
 */
export function supportStage(options: SupportStageOptions): VerifyStage<any> {
  const {
    judge,
    name = 'support',
    minRun = 24,
    requireContradiction = true,
    treatCantTellAs = 'reject',
    system = SUPPORT_SYSTEM,
    failPolicy = 'open',
    timeoutMs,
    tier,
  } = options;

  if (typeof judge !== 'function') {
    throw new TypeError('supportStage requires a `judge` function — you bring the model');
  }

  return {
    name,
    failPolicy,
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(tier ? { tier } : {}),
    check: async (input: SupportInput, ctx): Promise<StageOutcome<SupportResult>> => {
      if (!input || typeof input.claim !== 'string' || typeof input.source !== 'string') {
        return { ok: false, messages: ['supportStage expects { claim, source } as the input value'] };
      }

      // A throw here is an infrastructure failure and follows failPolicy — the
      // stage does not swallow it into a verdict.
      const raw = await judge({ system, user: supportPrompt(input), schema: SUPPORT_SCHEMA });
      const judgement = parseJudgement(raw);

      const guard = requireContradiction ? guardJudgement(judgement, input.source, minRun) : null;
      const verdict: Verdict =
        guard && guard !== 'verified' ? 'cant_tell' : judgement.verdict;
      if (guard && guard !== 'verified') {
        ctx.warn(`${name}: "not supported" was downgraded to "can't tell" (${guard})`);
      }

      const value: SupportResult = { ...input, ...judgement, verdict, guard };

      if (verdict === 'supported') return { ok: true, value };
      if (verdict === 'cant_tell' && treatCantTellAs === 'warn') {
        ctx.warn(`${name}: the source does not settle this claim`);
        return { ok: true, value };
      }
      return {
        ok: false,
        messages: [judgement.reasoning || `the source does not support this claim (${verdict})`],
        revision: value,
      };
    },
  };
}
