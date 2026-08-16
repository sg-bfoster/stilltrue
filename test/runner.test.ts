import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDriftCheck } from '../src/runner.ts';
import { json, surname, htmlToText } from '../src/helpers.ts';
import { resolveCompare } from '../src/compare.ts';

const DIR = process.cwd();

test('pass: markers present in corpus', async () => {
  const r = await runDriftCheck(
    {
      name: 'roster',
      source: async () => 'Board members: Smith, Jones, and Dr. Nguyen serve the district.',
      expect: ['Smith', 'jones', 'Nguyen'],
      compare: 'contains-all',
    },
    DIR,
  );
  assert.equal(r.outcome, 'pass');
  assert.deepEqual(r.messages, []);
});

test('rot: missing marker fails with one message per marker', async () => {
  const r = await runDriftCheck(
    {
      name: 'roster',
      source: async () => 'Board members: Smith only now.',
      expect: ['Smith', 'Jones', 'Nguyen'],
      compare: 'contains-all',
    },
    DIR,
  );
  assert.equal(r.outcome, 'rot');
  assert.equal(r.messages.length, 2);
  assert.match(r.messages[0]!, /Jones/);
});

test('error: throwing source is error, never rot', async () => {
  const r = await runDriftCheck(
    {
      name: 'down',
      source: async () => {
        throw new Error('HTTP 403');
      },
      expect: ['Smith'],
      compare: 'contains-all',
    },
    DIR,
  );
  assert.equal(r.outcome, 'error');
  assert.match(r.messages[0]!, /HTTP 403/);
});

test('error: throwing expect is error (misconfiguration, not rot)', async () => {
  const r = await runDriftCheck(
    {
      name: 'bad-expect',
      source: async () => 'anything',
      expect: json('./does-not-exist.json'),
      compare: 'contains-all',
    },
    DIR,
  );
  assert.equal(r.outcome, 'error');
  assert.match(r.messages[0]!, /expect failed/);
});

test('warnings from ctx.warn are captured without failing', async () => {
  const r = await runDriftCheck(
    {
      name: 'partial',
      source: async (ctx) => {
        ctx.warn('page 2 unreachable');
        return 'Smith is here';
      },
      expect: ['Smith'],
      compare: 'contains-all',
    },
    DIR,
  );
  assert.equal(r.outcome, 'pass');
  assert.deepEqual(r.warnings, ['page 2 unreachable']);
});

test('deep-equal default compare: rot lists pathed mismatches', async () => {
  const r = await runDriftCheck(
    {
      name: 'boc',
      source: async () => ({ chair: 'Hendrickson', districts: [1, 2, 3] }),
      expect: { chair: 'Nash', districts: [1, 2, 3] },
    },
    DIR,
  );
  assert.equal(r.outcome, 'rot');
  assert.match(r.messages[0]!, /\$\.chair/);
});

test('json expect helper resolves relative to configDir and derives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stilltrue-'));
  await writeFile(join(dir, 'board.json'), JSON.stringify({ members: [{ name: 'Dr. Jane Smith' }] }));
  const r = await runDriftCheck(
    {
      name: 'file-expect',
      source: async () => 'we welcome Smith to the board',
      expect: json<{ members: { name: string }[] }, string[]>('./board.json', (d) =>
        d.members.map((m) => surname(m.name)),
      ),
      compare: 'contains-all',
    },
    dir,
  );
  assert.equal(r.outcome, 'pass');
});

test('surname strips titles and takes last word', () => {
  assert.equal(surname('Dr. Jane van Smith'), 'Smith');
  assert.equal(surname('Mr Bob Jones'), 'Jones');
  assert.equal(surname('Cher'), 'Cher');
  assert.equal(surname('Jasper Watkins III'), 'Watkins');
  assert.equal(surname('Ken Griffey, Jr.'), 'Griffey');
});

test('htmlToText strips scripts, styles, tags, entities', () => {
  const text = htmlToText('<style>.x{}</style><p>A &amp; B&nbsp;C</p><script>bad()</script>');
  assert.equal(text.trim(), 'A & B C');
});

test('contains-all type-guards mismatched shapes as compare error', async () => {
  const r = await runDriftCheck(
    {
      name: 'shape',
      source: async () => ({ not: 'a string' }),
      expect: ['Smith'],
      compare: 'contains-all',
    },
    DIR,
  );
  assert.equal(r.outcome, 'error');
  assert.match(r.messages[0]!, /compare failed/);
});

test('deep-equal passes on identical nested structures', () => {
  const cmp = resolveCompare(undefined);
  assert.deepEqual(cmp({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] }), []);
});
