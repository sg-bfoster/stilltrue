import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../src/init.ts';
import { loadConfig } from '../src/loadConfig.ts';

test('init writes a config that leads with inline markers (no code required)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stilltrue-init-'));
  const r = await init(dir);
  assert.deepEqual(r.created, ['stilltrue.config.mjs']);
  assert.deepEqual(r.skipped, []);
  const config = await readFile(join(dir, 'stilltrue.config.mjs'), 'utf8');
  assert.match(config, /defineStilltrue/);
  assert.match(config, /contains-all/);
  // The active expect is a plain string list; json()/surname() appear only
  // in the commented "leveling up" section.
  assert.match(config, /'Jane Smith',/);
  assert.match(config, /Leveling up/);
});

test('init never overwrites an existing config (any extension)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stilltrue-init-'));
  await writeFile(join(dir, 'stilltrue.config.ts'), '// mine');
  const r = await init(dir);
  assert.deepEqual(r.created, []);
  assert.deepEqual(r.skipped, ['stilltrue.config.ts']);
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
  assert.equal(config.drift?.[0]?.name, 'my-first-check');
  assert.deepEqual(config.drift?.[0]?.expect, ['Jane Smith', 'Main Street Office', '12 locations']);
});
