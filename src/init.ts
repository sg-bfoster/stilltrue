import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_TEMPLATE = `// stilltrue configuration — one entry per fact-set you want watched.
// Docs: https://github.com/sg-bfoster/stilltrue#readme
// Picking good markers: https://github.com/sg-bfoster/stilltrue/blob/main/docs/MARKERS.md
import { defineStilltrue, corpus, json, surname } from 'stilltrue';

export default defineStilltrue({
  drift: [
    {
      // A short id for this check — shows up in output and reports.
      name: 'example-board-roster',

      // WHERE THE TRUTH LIVES: the official page(s) your facts came from.
      // corpus() fetches each page and strips it down to readable text.
      // If one page is unreachable it warns; only if ALL are down does the
      // check report an error (which never fails your build).
      source: corpus([
        'https://example.org/board',
        // 'https://example.org/about',   // add more pages if facts span several
      ]),

      // WHAT YOU BELIEVE: read your saved facts file and pick out the
      // "markers" — short, stable strings that must still appear on the
      // page(s) above. Here: each member's last name, plus one number.
      expect: json('./data/example-facts.json', (data) => [
        ...data.members.map((m) => surname(m.name)),
        \`\${data.totalSchools} schools\`,
      ]),

      // HOW TO COMPARE: 'contains-all' = every marker must appear in the
      // fetched text (case-insensitive). Any missing marker = rot = the
      // build fails and tells you which fact went stale.
      compare: 'contains-all',
    },
  ],
});
`;

const DATA_TEMPLATE = `{
  "_comment": "Example facts file - replace with your own data, or point the config at a file you already have.",
  "members": [
    { "name": "Dr. Jane Smith" },
    { "name": "Robert Jones Jr." }
  ],
  "totalSchools": 12
}
`;

export interface InitResult {
  created: string[];
  skipped: string[];
}

/** Write starter config + example data file. Never overwrites. */
export async function init(dir: string): Promise<InitResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const configPath = join(dir, 'stilltrue.config.mjs');
  const existingConfig = [
    'stilltrue.config.mjs',
    'stilltrue.config.ts',
    'stilltrue.config.mts',
    'stilltrue.config.js',
    'stilltrue.config.cjs',
  ].find((name) => existsSync(join(dir, name)));
  if (existingConfig) {
    skipped.push(existingConfig);
  } else {
    await writeFile(configPath, CONFIG_TEMPLATE);
    created.push('stilltrue.config.mjs');
  }

  const dataPath = join(dir, 'data', 'example-facts.json');
  if (existsSync(dataPath)) {
    skipped.push('data/example-facts.json');
  } else {
    await mkdir(join(dir, 'data'), { recursive: true });
    await writeFile(dataPath, DATA_TEMPLATE);
    created.push('data/example-facts.json');
  }

  return { created, skipped };
}
