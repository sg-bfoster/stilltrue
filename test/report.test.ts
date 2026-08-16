import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordRun, loadHistory } from '../src/history.ts';
import { renderReport } from '../src/report.ts';
import type { DriftResult } from '../src/config.ts';

function result(name: string, outcome: DriftResult['outcome'], messages: string[] = []): DriftResult {
  return { name, outcome, messages, warnings: [], checkedAt: '2026-08-16T12:00:00.000Z', durationMs: 5 };
}

test('recordRun + loadHistory roundtrip, oldest first', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'stilltrue-hist-')), 'h.jsonl');
  await recordRun([result('a', 'pass')], path);
  await recordRun([result('a', 'rot', ['gone: "Smith"'])], path);
  const history = await loadHistory(path);
  assert.equal(history.length, 2);
  assert.equal(history[0]!.results[0]!.outcome, 'pass');
  assert.equal(history[1]!.results[0]!.outcome, 'rot');
});

test('loadHistory: missing file is empty, corrupt lines skipped', async () => {
  assert.deepEqual(await loadHistory('/nonexistent/h.jsonl'), []);
  const { writeFile } = await import('node:fs/promises');
  const path = join(await mkdtemp(join(tmpdir(), 'stilltrue-hist-')), 'h.jsonl');
  await writeFile(path, '{"broken\n' + JSON.stringify({ at: 'x', results: [] }) + '\n');
  assert.equal((await loadHistory(path)).length, 1);
});

test('renderReport: names, glyphs paired with labels, rot messages present', () => {
  const html = renderReport([
    { at: '2026-08-09T14:17:00.000Z', results: [result('gcps-school-board', 'pass'), result('officials', 'pass')] },
    { at: '2026-08-16T14:17:00.000Z', results: [result('gcps-school-board', 'rot', ['marker gone: "Smith"']), result('officials', 'error', ['HTTP 403'])] },
  ]);
  assert.match(html, /gcps-school-board/);
  assert.match(html, /✗ rot/); // glyph + label, never color alone
  assert.match(html, /⚠ error/);
  assert.match(html, /marker gone: &quot;Smith&quot;/);
  assert.match(html, /HTTP 403/);
  assert.doesNotMatch(html, /<script/i); // self-contained, no JS
});

test('renderReport escapes HTML in names and messages', () => {
  const html = renderReport([
    { at: '2026-08-16T00:00:00.000Z', results: [result('<img src=x>', 'rot', ['<b>bad</b>'])] },
  ]);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /<b>bad<\/b>/);
  assert.match(html, /&lt;img src=x&gt;/);
});

test('renderReport handles a check missing from some runs (not-run cell)', () => {
  const html = renderReport([
    { at: '2026-08-09T00:00:00.000Z', results: [result('a', 'pass')] },
    { at: '2026-08-16T00:00:00.000Z', results: [result('a', 'pass'), result('b', 'pass')] },
  ]);
  assert.match(html, /cell none/);
});
