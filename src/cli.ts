#!/usr/bin/env node
/**
 * npx stilltrue drift [--config <path>] [--only <name,name>] [--json <path>]
 *
 * Exit codes: 0 = all pass (errors warn but never fail — a judge/source
 * outage must not block CI), 1 = rot detected or usage error.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findConfigPath, loadConfig } from './loadConfig.ts';
import { runDrift } from './runner.ts';
import { DEFAULT_HISTORY_PATH, loadHistory, recordRun } from './history.ts';
import { renderReport } from './report.ts';
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
      record: { type: 'boolean' },
      history: { type: 'string' },
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

  if (values.record) {
    const historyPath = resolve(values.history ?? DEFAULT_HISTORY_PATH);
    await recordRun(results, historyPath);
    console.log(`run recorded to ${historyPath}`);
  }

  return rotted > 0 ? 1 : 0;
}

async function report(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      history: { type: 'string' },
      out: { type: 'string' },
      title: { type: 'string' },
    },
  });
  const historyPath = resolve(values.history ?? DEFAULT_HISTORY_PATH);
  const history = await loadHistory(historyPath);
  if (!history.length) {
    console.error(
      `no recorded runs at ${historyPath} — run \`stilltrue drift --record\` first (use --history to point elsewhere)`,
    );
    return 1;
  }
  const out = resolve(values.out ?? 'stilltrue-report.html');
  await writeFile(out, renderReport(history, values.title));
  console.log(`report written to ${out} (${history.length} runs)`);
  return 0;
}

const [command, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case 'drift':
      process.exit(await drift(rest));
      break;
    case 'report':
      process.exit(await report(rest));
      break;
    case 'init': {
      const { init } = await import('./init.ts');
      const { created, skipped } = await init(process.cwd());
      for (const f of created) console.log(`created ${f}`);
      for (const f of skipped) console.log(`kept existing ${f} (never overwritten)`);
      if (created.length) {
        console.log(
          '\nNext steps:\n' +
            '  1. Edit stilltrue.config.mjs — point source at the real page(s) your facts came from\n' +
            '  2. Edit data/example-facts.json — or point the config at a facts file you already have\n' +
            '  3. Run: npx stilltrue drift\n' +
            'Picking good markers: docs/MARKERS.md in the stilltrue repo',
        );
      }
      process.exit(0);
      break;
    }
    case 'golden':
      console.error(
        'stilltrue deliberately has no golden runner — promptfoo tests your prompts; stilltrue tests your facts.\n' +
          'Use https://promptfoo.dev for prompt/answer regression evals. Doctrine + pairing guide: docs/GOLDEN.md',
      );
      process.exit(1);
      break;
    default:
      console.log(
        'usage: stilltrue init\n' +
          '       stilltrue drift [--config <path>] [--only <names>] [--json <path>] [--record] [--history <path>]\n' +
          '       stilltrue report [--history <path>] [--out <path>] [--title <text>]',
      );
      process.exit(command ? 1 : 0);
  }
} catch (err) {
  console.error(`stilltrue: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
