import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../src/init.ts';
import { loadConfig } from '../src/loadConfig.ts';

test('init writes config + example data with next-step markers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stilltrue-init-'));
  const r = await init(dir);
  assert.deepEqual(r.created, ['stilltrue.config.mjs', 'data/example-facts.json']);
  assert.deepEqual(r.skipped, []);
  const config = await readFile(join(dir, 'stilltrue.config.mjs'), 'utf8');
  assert.match(config, /defineStilltrue/);
  assert.match(config, /contains-all/);
  JSON.parse(await readFile(join(dir, 'data', 'example-facts.json'), 'utf8'));
});

test('init never overwrites an existing config (any extension) or data file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stilltrue-init-'));
  await writeFile(join(dir, 'stilltrue.config.ts'), '// mine');
  const r = await init(dir);
  assert.deepEqual(r.skipped, ['stilltrue.config.ts']);
  assert.deepEqual(r.created, ['data/example-facts.json']);
  const again = await init(dir);
  assert.deepEqual(again.created, []);
  assert.deepEqual(again.skipped, ['stilltrue.config.ts', 'data/example-facts.json']);
  assert.equal(await readFile(join(dir, 'stilltrue.config.ts'), 'utf8'), '// mine');
});

test('the generated config actually loads (template stays valid)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stilltrue-init-'));
  await init(dir);
  // The template imports from 'stilltrue'; alias it to this repo's source.
  const raw = await readFile(join(dir, 'stilltrue.config.mjs'), 'utf8');
  const selfPath = join(import.meta.dirname, '..', 'src', 'index.ts');
  await writeFile(join(dir, 'stilltrue.config.mjs'), raw.replace("'stilltrue'", JSON.stringify(selfPath)));
  const { config } = await loadConfig(join(dir, 'stilltrue.config.mjs'));
  assert.equal(config.drift?.length, 1);
  assert.equal(config.drift?.[0]?.name, 'example-board-roster');
  assert.equal(config.drift?.[0]?.compare, 'contains-all');
});
