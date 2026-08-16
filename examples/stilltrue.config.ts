/**
 * The seam litmus test (BRIEF, First session §2): express AskGwinnett's two
 * bespoke drift Actions in config, with zero special-casing, BEFORE writing
 * the runner. If this file can't express both cleanly, the seam is wrong.
 *
 * These sketches are transcriptions of the real checks in bfoster-services /
 * county-app; the source() bodies are placeholders until the swap (step 5).
 */
import { defineStilltrue } from 'stilltrue';

export default defineStilltrue({
  drift: [
    {
      // Weekly GCPS school-board roster check: scrape the live roster page,
      // compare surnames against the curated data file.
      name: 'gcps-board-roster',
      source: async () => {
        const html = await (await fetch('https://www.gcpsk12.org/board')).text();
        return scrapeBoardMembers(html); // consumer-owned parser
      },
      expect: './data/school-board.json',
      compare: 'surnames',
    },
    {
      // Weekly BOC (Board of Commissioners) refresh check: fetch the county
      // page, compare the full structured record deep-equal.
      name: 'boc-roster',
      source: async () => {
        const html = await (await fetch('https://www.gwinnettcounty.com/web/gwinnett/departments/boardofcommissioners')).text();
        return scrapeCommissioners(html);
      },
      expect: './data/boc.json',
      compare: 'deep-equal',
    },
  ],
});

declare function scrapeBoardMembers(html: string): { surname: string }[];
declare function scrapeCommissioners(html: string): unknown;
