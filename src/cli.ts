#!/usr/bin/env node
/**
 * npx stilltrue drift   — run drift checks (v0.1 scope)
 * npx stilltrue golden  — regression evals (later)
 * npx stilltrue report  — HTML drift report (later)
 */
const [command] = process.argv.slice(2);

switch (command) {
  case 'drift':
    console.error('stilltrue drift: not implemented yet — see docs/BRIEF.md, First session §3');
    process.exit(1);
  case undefined:
    console.log('usage: stilltrue <drift|golden|report>');
    process.exit(1);
  default:
    console.error(`stilltrue: unknown command "${command}"`);
    process.exit(1);
}
