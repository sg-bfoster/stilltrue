/**
 * `stilltrue report` — a self-contained HTML drift report: latest-run summary
 * tiles, a checks × runs timeline grid, and the log of what rotted. Pure
 * function of recorded history; no network, no JS dependencies.
 *
 * Status colors (validated palette): outcome is never color alone — every
 * cell and badge carries its glyph (✓ / ✗ / ⚠) and rows/labels stay in ink.
 */
import type { DriftOutcome } from './config.ts';
import type { RunRecord } from './history.ts';

const STATUS: Record<DriftOutcome, { color: string; glyph: string; ink: string; label: string }> = {
  pass: { color: '#0ca30c', glyph: '✓', ink: '#ffffff', label: 'pass' },
  rot: { color: '#d03b3b', glyph: '✗', ink: '#ffffff', label: 'rot' },
  error: { color: '#fab219', glyph: '⚠', ink: '#1a1a19', label: 'error' },
};

const MAX_COLUMNS = 60;
const MAX_LOG = 50;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function day(iso: string): string {
  return iso.slice(5, 10); // MM-DD
}

export function renderReport(history: RunRecord[], title = 'stilltrue drift report'): string {
  const runs = history.slice(-MAX_COLUMNS);
  const latest = runs[runs.length - 1];

  // Stable row order: latest run's order first, then any check seen earlier.
  const names: string[] = [];
  for (const record of [...runs].reverse()) {
    for (const r of record.results) if (!names.includes(r.name)) names.push(r.name);
  }

  const counts = { pass: 0, rot: 0, error: 0 };
  for (const r of latest?.results ?? []) counts[r.outcome]++;

  const tiles = (['pass', 'rot', 'error'] as const)
    .map(
      (o) => `<div class="tile">
        <div class="tile-num" style="color:${counts[o] && o !== 'pass' ? STATUS[o].color : 'var(--ink)'}">${counts[o]}</div>
        <div class="tile-label">${STATUS[o].glyph} ${STATUS[o].label}</div>
      </div>`,
    )
    .join('');

  const headerCells = runs
    .map((rec, i) => {
      const sparse = runs.length <= 10 || i % Math.ceil(runs.length / 10) === 0 || i === runs.length - 1;
      return `<th title="${esc(rec.at)}">${sparse ? day(rec.at) : ''}</th>`;
    })
    .join('');

  const rows = names
    .map((name) => {
      const cells = runs
        .map((rec) => {
          const r = rec.results.find((x) => x.name === name);
          if (!r) return '<td><span class="cell none" title="not run"></span></td>';
          const s = STATUS[r.outcome];
          const detail = [r.outcome, ...r.messages, ...r.warnings.map((w) => `warning: ${w}`)].join('\n');
          return `<td><span class="cell" style="background:${s.color};color:${s.ink}" title="${esc(rec.at)}\n${esc(detail)}">${s.glyph}</span></td>`;
        })
        .join('');
      return `<tr><th class="check-name">${esc(name)}</th>${cells}</tr>`;
    })
    .join('');

  const events = [...runs]
    .reverse()
    .flatMap((rec) =>
      rec.results
        .filter((r) => r.outcome !== 'pass' || r.warnings.length)
        .map((r) => ({ at: rec.at, ...r })),
    )
    .slice(0, MAX_LOG);

  const log = events.length
    ? events
        .map((e) => {
          const s = STATUS[e.outcome];
          const items = [...e.messages, ...e.warnings.map((w) => `warning: ${w}`)]
            .map((m) => `<li>${esc(m)}</li>`)
            .join('');
          return `<details ${e.outcome === 'rot' ? 'open' : ''}>
            <summary><span class="badge" style="background:${s.color};color:${s.ink}">${s.glyph} ${s.label}</span>
            <strong>${esc(e.name)}</strong> <span class="muted">${esc(e.at)}</span></summary>
            <ul>${items}</ul>
          </details>`;
        })
        .join('')
    : '<p class="muted">Nothing has rotted, errored, or warned in recorded history.</p>';

  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --bg:#ffffff; --ink:#1a1a19; --ink-2:#5f5e5a; --line:#e4e2dd; --surface:#f6f5f2; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1a1a19; --ink:#f2f1ee; --ink-2:#a5a39d; --line:#3a3936; --surface:#242422; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem 1.5rem; background:var(--bg); color:var(--ink);
         font:15px/1.5 ui-sans-serif, system-ui, sans-serif; max-width:64rem; margin-inline:auto; }
  h1 { font-size:1.3rem; margin:0 0 .25rem; }
  h2 { font-size:1rem; margin:2rem 0 .75rem; }
  .muted { color:var(--ink-2); font-size:.85rem; }
  .tiles { display:flex; gap:.75rem; margin:1.25rem 0; flex-wrap:wrap; }
  .tile { background:var(--surface); border:1px solid var(--line); border-radius:8px;
          padding:.75rem 1.25rem; min-width:6.5rem; }
  .tile-num { font-size:1.6rem; font-weight:600; font-variant-numeric:tabular-nums; }
  .tile-label { color:var(--ink-2); font-size:.85rem; }
  .grid-wrap { overflow-x:auto; border:1px solid var(--line); border-radius:8px; padding:.75rem; }
  table { border-collapse:separate; border-spacing:2px; }
  th { font-weight:500; color:var(--ink-2); font-size:.7rem; text-align:left; white-space:nowrap; }
  thead th { vertical-align:bottom; padding-bottom:.25rem; }
  .check-name { font-size:.85rem; color:var(--ink); padding-right:.75rem; position:sticky; left:0; background:var(--bg); }
  .cell { display:inline-flex; width:20px; height:20px; border-radius:4px;
          align-items:center; justify-content:center; font-size:12px; }
  .cell.none { background:var(--surface); border:1px dashed var(--line); }
  .badge { display:inline-block; border-radius:4px; padding:0 .45rem; font-size:.8rem; margin-right:.5rem; }
  details { border-left:2px solid var(--line); padding:.35rem .75rem; margin:.4rem 0; }
  summary { cursor:pointer; }
  details ul { margin:.4rem 0 .2rem; padding-left:1.2rem; }
  details li { font-size:.9rem; }
</style>
<h1>${esc(title)}</h1>
<p class="muted">${runs.length} recorded run${runs.length === 1 ? '' : 's'}${
    latest ? `, latest ${esc(latest.at)}` : ''
  } — pass / rot (facts changed) / error (source unreachable)</p>
<div class="tiles">${tiles}</div>
<h2>Timeline</h2>
<div class="grid-wrap"><table>
  <thead><tr><th></th>${headerCells}</tr></thead>
  <tbody>${rows}</tbody>
</table></div>
<h2>Rot, errors &amp; warnings</h2>
${log}
`;
}
