import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DriftResult } from './config.ts';

/** One recorded `stilltrue drift` run. */
export interface RunRecord {
  at: string;
  results: DriftResult[];
}

export const DEFAULT_HISTORY_PATH = '.stilltrue/history.jsonl';

/** Append a run to the JSONL history file (created on first record). */
export async function recordRun(results: DriftResult[], historyPath: string): Promise<RunRecord> {
  const record: RunRecord = { at: new Date().toISOString(), results };
  await mkdir(dirname(historyPath), { recursive: true });
  await appendFile(historyPath, JSON.stringify(record) + '\n');
  return record;
}

/** Load history oldest-first. Missing file → []. Corrupt lines are skipped. */
export async function loadHistory(historyPath: string): Promise<RunRecord[]> {
  let raw: string;
  try {
    raw = await readFile(historyPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const records: RunRecord[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.at === 'string' && Array.isArray(parsed.results)) {
        records.push(parsed);
      }
    } catch {
      // A truncated line (interrupted CI write) shouldn't sink the report.
    }
  }
  return records;
}
