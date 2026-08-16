#!/usr/bin/env node
/**
 * npx stilltrue drift [--config <path>] [--only <name,name>] [--json <path>]
 *
 * Exit codes: 0 = all pass (errors warn but never fail — a judge/source
 * outage must not block CI), 1 = rot detected or usage error.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { findConfigPath, loadConfig } from './loadConfig.ts';
import { runDrift } from './runner.ts';
import type { DriftResult } from './config.ts';

const GH = !!process.env.GITHUB_ACTIONS;

function printResult(r: DriftResult): void {
  const icon = { pass: '✓', rot: '✗', error: '⚠' }[r.outcome];
  console.log(`${icon} ${r.name} — ${r.outcome} (${r.durationMs}ms)`);
  for (const w of r.warnings) {
    console.log(`    warning: ${w}`);
    if (GH) console.log(`::warning::${r.name}: ${w}`);
  }
  for (const m of r.messages) {
    console.log(`    ${m}`);
    if (GH) console.log(`::${r.outcome === 'rot' ? 'error' : 'warning'}::${r.name}: ${m}`);
  }
}

async function drift(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string' },
      only: { type: 'string' },
      json: { type: 'string' },
    },
  });

  const configPath = findConfigPath(process.cwd(), values.config);
  const { config, configDir } = await loadConfig(configPath);
  if (!config.drift?.length) {
    console.error('no drift checks configured');
    return 1;
  }

  const results = await runDrift(config, {
    configDir,
    only: values.only ? values.only.split(',').map((s) => s.trim()) : undefined,
  });

  for (const r of results) printResult(r);

  const rotted = results.filter((r) => r.outcome === 'rot').length;
  const errored = results.filter((r) => r.outcome === 'error').length;
  const passed = results.filter((r) => r.outcome === 'pass').length;
  console.log(`\n${passed} pass, ${rotted} rot, ${errored} error (errors warn, never fail)`);

  if (values.json) {
    await writeFile(values.json, JSON.stringify(results, null, 2));
    console.log(`results written to ${values.json}`);
  }

  return rotted > 0 ? 1 : 0;
}

const [command, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case 'drift':
      process.exit(await drift(rest));
      break;
    case 'golden':
    case 'report':
      console.error(`stilltrue ${command}: not implemented yet — drift shipped first (docs/BRIEF.md)`);
      process.exit(1);
      break;
    default:
      console.log('usage: stilltrue drift [--config <path>] [--only <names>] [--json <path>]');
      process.exit(command ? 1 : 0);
  }
} catch (err) {
  console.error(`stilltrue: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
