import { writeFile } from 'node:fs/promises';
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
      name: 'my-first-check',

      // WHERE THE TRUTH LIVES: the official page(s) your facts came from.
      // corpus() fetches each page and strips it down to readable text.
      source: corpus([
        'https://example.org/about',
        // 'https://example.org/board',   // add more pages if facts span several
      ]),

      // WHAT YOU BELIEVE: list the facts as short strings ("markers").
      // Every one of these must still appear somewhere on the page(s)
      // above, or the check fails and names the missing one.
      expect: [
        'Jane Smith',
        'Main Street Office',
        '12 locations',
      ],

      // HOW TO COMPARE: 'contains-all' = every marker must appear in the
      // fetched page text (case-insensitive).
      compare: 'contains-all',
    },

    // ── Leveling up (optional) ──────────────────────────────────────────
    //
    // Instead of listing markers inline, you can keep them in a file.
    // If ./data/markers.json contains just a list of strings —
    //   ["Jane Smith", "Main Street Office", "12 locations"]
    // — then this works with no code at all:
    //
    //   expect: json('./data/markers.json'),
    //
    // And if your app already keeps structured data — say
    // ./data/board.json looks like
    //   { "members": [ { "name": "Dr. Jane Smith" }, { "name": "Bob Jones Jr." } ] }
    // — you can derive the markers from it, so your data file stays the
    // single source of truth (surname() keeps just "Smith" / "Jones",
    // because pages change titles and first names more than surnames):
    //
    //   expect: json('./data/board.json', (data) =>
    //     data.members.map((m) => surname(m.name))
    //   ),
  ],
});
`;

export interface InitResult {
  created: string[];
  skipped: string[];
}

/** Write the starter config. Never overwrites an existing one. */
export async function init(dir: string): Promise<InitResult> {
  const existingConfig = [
    'stilltrue.config.mjs',
    'stilltrue.config.ts',
    'stilltrue.config.mts',
    'stilltrue.config.js',
    'stilltrue.config.cjs',
  ].find((name) => existsSync(join(dir, name)));
  if (existingConfig) {
    return { created: [], skipped: [existingConfig] };
  }
  await writeFile(join(dir, 'stilltrue.config.mjs'), CONFIG_TEMPLATE);
  return { created: ['stilltrue.config.mjs'], skipped: [] };
}
