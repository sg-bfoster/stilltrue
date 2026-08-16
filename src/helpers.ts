import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CheckContext } from './config.ts';

export interface CorpusOptions {
  /** Per-page fetch timeout, ms. Default 20000. */
  timeoutMs?: number;
  /** Sent as User-Agent so site operators can identify the check. */
  userAgent?: string;
}

/** Strip a page to comparable text (same normalization as the original check). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Source helper: fetch pages and concatenate them into one text corpus.
 * Individual unreachable pages warn; ALL pages unreachable throws, which the
 * runner reports as `error` (source down ≠ facts rotted).
 */
export function corpus(urls: string[], options: CorpusOptions = {}) {
  const { timeoutMs = 20_000, userAgent = 'stilltrue drift check (github.com/sg-bfoster/stilltrue)' } = options;
  return async (ctx: CheckContext): Promise<string> => {
    let text = '';
    const unreachable: string[] = [];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'User-Agent': userAgent },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text += ` ${htmlToText(await res.text())}`;
      } catch (err) {
        unreachable.push(`${url} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    if (!text.trim()) {
      throw new Error(`all pages unreachable: ${unreachable.join('; ')}`);
    }
    for (const miss of unreachable) ctx.warn(`page unreachable: ${miss}`);
    return text;
  };
}

/**
 * Expect helper: read a curated JSON data file (path relative to the config
 * file) and optionally derive the comparable expectation from it — e.g. the
 * marker list for 'contains-all'.
 */
export function json<T = any, E = T>(path: string, derive?: (data: T) => E) {
  return async (ctx: CheckContext): Promise<E> => {
    const data = JSON.parse(await readFile(resolve(ctx.configDir, path), 'utf8')) as T;
    return derive ? derive(data) : (data as unknown as E);
  };
}

/**
 * Surname as the drift signal — titles and first names vary in page copy
 * ("Dr. Jane Smith" vs "Superintendent Smith"); the surname is stable.
 * Leading honorifics and trailing generational suffixes are stripped
 * ("Jasper Watkins III" → "Watkins").
 */
export function surname(fullName: string): string {
  const cleaned = String(fullName)
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, '')
    .replace(/,?\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .trim();
  const parts = cleaned.split(/\s+/);
  return parts[parts.length - 1] ?? '';
}
