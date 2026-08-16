import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { runVerify, zodStage, formatRejection, generateVerified, type VerifyStage } from '../src/verify.ts';

const pass = (name: string): VerifyStage<any> => ({ name, check: () => ({ ok: true }) });
const fail = (name: string, messages: string[]): VerifyStage<any> => ({
  name,
  check: () => ({ ok: false, messages }),
});

test('stages run in order and short-circuit at first rejection', async () => {
  let ranLater = false;
  const r = await runVerify(
    [pass('a'), fail('b', ['broke 1', 'broke 2']), { name: 'c', check: () => ((ranLater = true), { ok: true }) }],
    'input',
  );
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'b');
  assert.deepEqual(r.messages, ['broke 1', 'broke 2']); // failing stage only, not cumulative
  assert.deepEqual(r.stagesRun, ['a', 'b']);
  assert.equal(ranLater, false);
});

test('a passing stage may transform the value for later stages', async () => {
  const r = await runVerify<any>(
    [
      { name: 'parse', check: (v) => ({ ok: true, value: JSON.parse(v) }) },
      { name: 'shape', check: (v) => (v.n === 1 ? { ok: true } : { ok: false, messages: ['bad n'] }) },
    ],
    '{"n":1}',
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { n: 1 });
});

test('fail-open: a throwing stage warns and continues (judge outage must not block)', async () => {
  const r = await runVerify(
    [{ name: 'judge', check: () => Promise.reject(new Error('LLM down')) }, pass('after')],
    'draft',
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.stagesRun, ['judge', 'after']);
  assert.match(r.warnings[0]!, /fail-open: judge: LLM down/);
});

test('fail-closed: a throwing stage rejects', async () => {
  const r = await runVerify(
    [{ name: 'gate', failPolicy: 'closed', check: () => Promise.reject(new Error('boom')) }],
    'x',
  );
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'gate');
});

test('timeout follows failPolicy (open by default)', async () => {
  const slow: VerifyStage<string> = {
    name: 'slow-judge',
    timeoutMs: 20,
    check: () => new Promise((res) => setTimeout(() => res({ ok: true }), 200)),
  };
  const r = await runVerify([slow], 'draft');
  assert.equal(r.ok, true);
  assert.match(r.warnings[0]!, /stage timeout after 20ms/);
});

test('revision: rejecting stage supplies a corrected value (review.js rewrite)', async () => {
  const r = await runVerify<string>(
    [{ name: 'judge', check: () => ({ ok: false, messages: ['ungrounded fact'], revision: 'fixed draft' }) }],
    'bad draft',
  );
  assert.equal(r.ok, false);
  assert.equal(r.revised, true);
  assert.equal(r.value, 'fixed draft');
});

test('ci-tier stages are skipped inline and run with tier: ci', async () => {
  const sim: VerifyStage<any> = { name: 'chase-sim', tier: 'ci', check: () => ({ ok: false, messages: ['stuck'] }) };
  const inline = await runVerify([pass('fast'), sim], {});
  assert.equal(inline.ok, true);
  assert.deepEqual(inline.stagesRun, ['fast']);
  const ci = await runVerify([pass('fast'), sim], {}, { tier: 'ci' });
  assert.equal(ci.ok, false);
  assert.equal(ci.stage, 'chase-sim');
});

test('zodStage: parse gate with one message per issue, typed value flows on', async () => {
  const schema = z.object({ name: z.string(), age: z.number() });
  const bad = await runVerify([zodStage('parse_schema', schema)], { name: 5 });
  assert.equal(bad.ok, false);
  assert.equal(bad.stage, 'parse_schema');
  assert.equal(bad.messages.length, 2);
  assert.match(bad.messages[0]!, /^name: /);
  const good = await runVerify([zodStage('parse_schema', schema)], { name: 'a', age: 3 });
  assert.equal(good.ok, true);
});

test('formatRejection preserves messages verbatim as bullets', async () => {
  const r = await runVerify([fail('model_invariants', ['portal p1 span 2.3m off-grid'])], {});
  assert.equal(
    formatRejection(r),
    'Rejected at stage "model_invariants":\n- portal p1 span 2.3m off-grid',
  );
});

test('generateVerified: retries once with feedback, returns last rejection after cap', async () => {
  const seen: (string | undefined)[] = [];
  const r = await generateVerified<string>({
    generate: (feedback) => {
      seen.push(feedback?.stage);
      return 'always bad';
    },
    stages: [fail('gate', ['nope'])],
  });
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 2);
  assert.deepEqual(seen, [undefined, 'gate']); // second attempt got the rejection
});

test('generateVerified: passes on a fixed retry', async () => {
  let n = 0;
  const r = await generateVerified<number>({
    generate: () => ++n,
    stages: [{ name: 'is-two', check: (v) => (v === 2 ? { ok: true } : { ok: false, messages: ['not 2'] }) }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.equal(r.value, 2);
});
