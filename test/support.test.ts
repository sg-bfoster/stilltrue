import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerify, generateVerified } from '../src/verify.ts';
import {
  supportStage,
  supportPrompt,
  guardJudgement,
  longestRun,
  SUPPORT_SYSTEM,
  type SupportJudgement,
} from '../src/support.ts';

/** A judge that returns whatever you hand it, recording what it was asked. */
const judgeReturning = (out: Partial<SupportJudgement> | string) => {
  const calls: any[] = [];
  const judge = async (req: any) => {
    calls.push(req);
    return typeof out === 'string'
      ? out
      : { verdict: 'cant_tell', reasoning: '', evidence: null, contradiction: null, ...out };
  };
  return { judge, calls };
};

const REBATE_SOURCE =
  'The efficiency rebate is open to residents of the county who own their home. '
  + 'Households earning above 120 percent of area median income are not eligible.';
const MUSEUM_SOURCE =
  'Every Sunday the museum waives all general-admission fees; special exhibitions may still require a timed ticket.';

// ── the guard ───────────────────────────────────────────────────────────────

test('a real contradicting quote sustains not_supported', () => {
  const g = guardJudgement(
    {
      verdict: 'not_supported',
      reasoning: '',
      evidence: null,
      contradiction: 'Households earning above 120 percent of area median income are not eligible.',
    },
    REBATE_SOURCE,
    24,
  );
  assert.equal(g, 'verified');
});

test('an invented quote downgrades the verdict', () => {
  const g = guardJudgement(
    { verdict: 'not_supported', reasoning: '', evidence: null, contradiction: 'Admission is never free on any day.' },
    MUSEUM_SOURCE,
    24,
  );
  assert.equal(g, 'quote-not-in-source');
});

test('no quote at all downgrades the verdict', () => {
  const g = guardJudgement(
    { verdict: 'not_supported', reasoning: '', evidence: null, contradiction: null },
    MUSEUM_SOURCE,
    24,
  );
  assert.equal(g, 'no-contradiction-quoted');
});

test('the guard never touches supported or cant_tell', () => {
  for (const verdict of ['supported', 'cant_tell'] as const) {
    const g = guardJudgement({ verdict, reasoning: '', evidence: null, contradiction: null }, MUSEUM_SOURCE, 24);
    assert.equal(g, null, `${verdict} must be left alone`);
  }
});

test('a tidied quote still matches on a contiguous run', () => {
  // The regression this exists for: the judge quoted "dogs must remain on a
  // leash ..." where the source reads "Dogs are permitted in all county parks
  // BUT must remain on a leash ...". Exact matching threw away a correct
  // verdict; tidying a quote is what careful writers do.
  const src =
    'Dogs are permitted in all county parks but must remain on a leash no longer than six feet at all times.';
  const g = guardJudgement(
    {
      verdict: 'not_supported',
      reasoning: '',
      evidence: null,
      contradiction: 'dogs must remain on a leash no longer than six feet at all times.',
    },
    src,
    24,
  );
  assert.equal(g, 'verified');
});

test('a short table line still counts — 40 would have discarded it', () => {
  // "Seniors 65 and over $1.00." is 26 characters. Contradictions in prose run
  // 76-96, which is why a threshold picked by intuition rejected fee tables.
  const src = 'Transit fares: Standard adult fare $2.50. Seniors 65 and over $1.00. Children under 5 ride free.';
  const g = guardJudgement(
    { verdict: 'not_supported', reasoning: '', evidence: null, contradiction: 'Seniors 65 and over $1.00.' },
    src,
    24,
  );
  assert.equal(g, 'verified');
});

test('longestRun finds the longest shared span, not merely any match', () => {
  assert.equal(longestRun('abcdef', 'zzabcdezz'), 5);
  assert.equal(longestRun('nothing alike', 'xxxxxxxx'), 0);
});

// ── the stage ───────────────────────────────────────────────────────────────

test('supported passes and carries the judgement through', async () => {
  const { judge } = judgeReturning({ verdict: 'supported', reasoning: 'it says so', evidence: 'waives all fees' });
  const r = await runVerify([supportStage({ judge })], { claim: 'Admission is free', source: MUSEUM_SOURCE });
  assert.equal(r.ok, true);
  assert.equal(r.value.verdict, 'supported');
  assert.equal(r.value.evidence, 'waives all fees');
  assert.equal(r.value.guard, null);
});

test('an unevidenced not_supported is downgraded, warned about, and rejected', async () => {
  const { judge } = judgeReturning({ verdict: 'not_supported', reasoning: 'nope', contradiction: null });
  const r = await runVerify([supportStage({ judge })], { claim: 'Admission is free', source: MUSEUM_SOURCE });
  assert.equal(r.ok, false);
  assert.equal(r.value.verdict, 'cant_tell', 'the verdict must not survive without a quote');
  assert.equal(r.value.guard, 'no-contradiction-quoted');
  assert.ok(r.warnings.some((w) => /downgraded/.test(w)), 'the downgrade must be visible, not silent');
});

test('requireContradiction:false restores the naive verdict', async () => {
  const { judge } = judgeReturning({ verdict: 'not_supported', reasoning: 'nope', contradiction: null });
  const r = await runVerify(
    [supportStage({ judge, requireContradiction: false })],
    { claim: 'Admission is free', source: MUSEUM_SOURCE },
  );
  assert.equal(r.value.verdict, 'not_supported');
  assert.equal(r.value.guard, null);
});

test('treatCantTellAs:warn passes an unanswerable claim instead of failing it', async () => {
  const { judge } = judgeReturning({ verdict: 'cant_tell', reasoning: 'not addressed' });
  const r = await runVerify(
    [supportStage({ judge, treatCantTellAs: 'warn' })],
    { claim: 'The museum has 40 staff', source: MUSEUM_SOURCE },
  );
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /does not settle/.test(w)));
});

test('an unrecognised verdict is coerced to cant_tell, never to supported', async () => {
  const { judge } = judgeReturning({ verdict: 'probably' as any, reasoning: 'x' });
  const r = await runVerify([supportStage({ judge })], { claim: 'c', source: MUSEUM_SOURCE });
  assert.equal(r.value.verdict, 'cant_tell');
});

test('JSON wrapped in prose or a fence is recovered', async () => {
  const { judge } = judgeReturning(
    'Here is my answer:\n```json\n{"verdict":"supported","reasoning":"ok","evidence":null,"contradiction":null}\n```',
  );
  const r = await runVerify([supportStage({ judge })], { claim: 'c', source: MUSEUM_SOURCE });
  assert.equal(r.ok, true);
  assert.equal(r.value.verdict, 'supported');
});

test('the judge is handed the prompt, and SOURCE precedes CLAIM', async () => {
  const { judge, calls } = judgeReturning({ verdict: 'supported', reasoning: 'x' });
  await runVerify([supportStage({ judge })], { claim: 'THE-CLAIM', source: 'THE-SOURCE' });
  assert.equal(calls[0].system, SUPPORT_SYSTEM);
  assert.ok(calls[0].schema, 'the schema must be offered for constrained decoding');
  // Source first so a second claim against the same source reuses the prefix.
  assert.ok(calls[0].user.indexOf('THE-SOURCE') < calls[0].user.indexOf('THE-CLAIM'));
  assert.equal(supportPrompt({ claim: 'c', source: 's' }), 'SOURCE:\ns\n\nCLAIM:\nc');
});

test('a judge outage warns rather than rejecting, by default', async () => {
  const judge = async () => { throw new Error('model unreachable'); };
  const r = await runVerify([supportStage({ judge })], { claim: 'c', source: 's' });
  assert.equal(r.ok, true, 'failPolicy open: infrastructure failure must not read as a verdict');
  assert.ok(r.warnings.length > 0);
});

test('failPolicy closed rejects on a judge outage', async () => {
  const judge = async () => { throw new Error('model unreachable'); };
  const r = await runVerify([supportStage({ judge, failPolicy: 'closed' })], { claim: 'c', source: 's' });
  assert.equal(r.ok, false);
});

test('a missing judge fails loudly at construction', () => {
  assert.throws(() => supportStage({} as any), /requires a `judge` function/);
});

test('bad input is rejected rather than sent to the model', async () => {
  const { judge, calls } = judgeReturning({ verdict: 'supported', reasoning: 'x' });
  const r = await runVerify([supportStage({ judge })], { claim: 'only a claim' } as any);
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0, 'no point spending a model call on input we know is wrong');
});

test('it composes with generateVerified', async () => {
  let attempt = 0;
  const judge = async () =>
    attempt++ === 0
      ? { verdict: 'cant_tell', reasoning: 'not addressed', evidence: null, contradiction: null }
      : { verdict: 'supported', reasoning: 'now it says so', evidence: 'x', contradiction: null };
  const r = await generateVerified({
    generate: () => ({ claim: 'c', source: MUSEUM_SOURCE }),
    stages: [supportStage({ judge })],
  });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
});
